//! Saving and opening a file from the Android app.
//!
//! Both of the ways the web build uses fail in the Android WebView, and both
//! fail *silently* — which is the reason this module exists at all:
//!
//! * A download is `a.download = …` on a `blob:` URL. There is no download
//!   manager behind that attribute in a WebView, so the click produces no file,
//!   no error and no hint that anything happened.
//! * "Öffnen" navigates the tab to the same `blob:` URL. The WebView has no
//!   PDF viewer either, so the page simply stays where it is.
//!
//! So the bytes travel to Rust and come back as a real Android file: `save_file`
//! writes into the public Downloads collection, `open_file` hands a
//! `content://` URI to whatever viewer is installed. Neither needs a permission
//! — see [`android::insert_download`] for why.
//!
//! Like `gmail_share`, this lives in tracked Rust rather than in the generated
//! Android project (`src-tauri/gen`, gitignored), where a Kotlin change would
//! vanish on the next `tauri android init`.

// On the desktop neither command is reachable — the frontend only calls them
// inside the Android app — so the parameters are deliberately unread there.
#![cfg_attr(not(target_os = "android"), allow(dead_code))]

/// Writes `data` into the device's Downloads folder and answers where it landed.
///
/// The answer is shown to the user: the write is silent, so without it there is
/// no way to tell a saved file from a swallowed one.
#[tauri::command]
pub async fn save_file(name: String, mime: String, data: String) -> Result<String, String> {
  #[cfg(target_os = "android")]
  {
    crate::android::run(move || android::save(&name, &mime, &data)).await
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = (name, mime, data);
    Err("Dateien speichern gibt es nur in der Android-App.".to_string())
  }
}

/// Hands the file to an installed viewer instead of opening a tab.
#[tauri::command]
pub async fn open_file(
  app: tauri::AppHandle,
  name: String,
  mime: String,
  data: String,
) -> Result<(), String> {
  #[cfg(target_os = "android")]
  {
    use tauri::Manager;
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    crate::android::run(move || android::open(&cache_dir, &name, &mime, &data)).await
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = (app, name, mime, data);
    Err("Dateien öffnen gibt es nur in der Android-App.".to_string())
  }
}

#[cfg(target_os = "android")]
mod android {
  use crate::android as jni_util;
  use jni::objects::{JClass, JObject, JString, JValue};
  use jni::JNIEnv;
  use std::path::Path;

  /// Sub-directory of the cache that holds the copies handed to a viewer.
  const SHARE_DIR: &str = "open-file";

  /// `MediaStore.Downloads`, the public Downloads collection. It exists from
  /// API 29 on, which is also the version from which writing to it needs no
  /// permission.
  const MIN_MEDIASTORE: i32 = 29;

  /// The three column names, read from `MediaStore.MediaColumns` rather than
  /// written out.
  ///
  /// Writing them out is a trap: `DISPLAY_NAME` is **`_display_name`**, with a
  /// leading underscore, and a wrong name is not a compile error — the insert
  /// throws `IllegalArgumentException: Invalid column display_name` at runtime,
  /// which surfaces as a bare „Android hat den Aufruf abgelehnt“. Reading the
  /// constants keeps this correct whatever the platform calls them.
  fn columns(env: &mut JNIEnv) -> Result<(String, String, String), String> {
    let class = env
      .find_class("android/provider/MediaStore$MediaColumns")
      .map_err(|e| jni_util::jni_error(env, e))?;
    let display = static_string(env, &class, "DISPLAY_NAME")?;
    let mime = static_string(env, &class, "MIME_TYPE")?;
    let pending = static_string(env, &class, "IS_PENDING")?;
    Ok((display, mime, pending))
  }

  fn static_string(env: &mut JNIEnv, class: &JClass, field: &str) -> Result<String, String> {
    let value = env
      .get_static_field(class, field, "Ljava/lang/String;")
      .and_then(|value| value.l())
      .map_err(|e| jni_util::jni_error(env, e))?;
    let value = JString::from(value);
    let text: String = env.get_string(&value).map_err(|e| jni_util::jni_error(env, e))?.into();
    Ok(text)
  }

  pub fn save(name: &str, mime: &str, data: &str) -> Result<String, String> {
    let file = jni_util::safe_name(name);
    let bytes = jni_util::decode_base64(data, &format!("„{file}“"))?;
    jni_util::with_context(|env, context| {
      if jni_util::sdk_int(env)? >= MIN_MEDIASTORE {
        insert_download(env, context, &file, mime, &bytes)
      } else {
        write_to_app_folder(env, context, &file, &bytes)
      }
    })
  }

  pub fn open(cache_dir: &Path, name: &str, mime: &str, data: &str) -> Result<(), String> {
    let file = jni_util::safe_name(name);
    let bytes = jni_util::decode_base64(data, &format!("„{file}“"))?;
    // A receiving app can only read a `content://` URI, and such a URI only
    // exists for a file that is really on disk — hence the copy.
    let dir = cache_dir.join(SHARE_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Ordner für die Datei: {e}"))?;
    let path = dir.join(&file);
    std::fs::write(&path, bytes).map_err(|e| format!("{file} schreiben: {e}"))?;
    jni_util::with_context(|env, context| view(env, context, &path, mime))
  }

  /// Writes through `MediaStore`, which needs **no permission** from API 29 on:
  /// the app only ever touches rows it created itself, so the old
  /// `WRITE_EXTERNAL_STORAGE` route is not needed — and deliberately not
  /// requested.
  ///
  /// The row is inserted as *pending* and only published once the bytes are
  /// written. Without that the Downloads app can pick it up while the stream is
  /// still open and show a truncated file.
  fn insert_download(
    env: &mut JNIEnv,
    context: &JObject,
    name: &str,
    mime: &str,
    bytes: &[u8],
  ) -> Result<String, String> {
    // `android.provider.MediaStore.Downloads` — *provider*, not `android.media`.
    // The wrong package is not a compile error: `FindClass` only fails at
    // runtime, with `ClassNotFoundException` in logcat.
    let class = env
      .find_class("android/provider/MediaStore$Downloads")
      .map_err(|e| jni_util::jni_error(env, e))?;
    let collection = env
      .get_static_field(&class, "EXTERNAL_CONTENT_URI", "Landroid/net/Uri;")
      .and_then(|value| value.l())
      .map_err(|e| jni_util::jni_error(env, e))?;

    let (display_name, mime_type, is_pending) = columns(env)?;
    let values = env
      .new_object("android/content/ContentValues", "()V", &[])
      .map_err(|e| jni_util::jni_error(env, e))?;
    put_string(env, &values, &display_name, name)?;
    put_string(env, &values, &mime_type, mime)?;
    put_string(env, &values, &is_pending, "1")?;

    let resolver = env
      .call_method(
        context,
        "getContentResolver",
        "()Landroid/content/ContentResolver;",
        &[],
      )
      .and_then(|value| value.l())
      .map_err(|e| jni_util::jni_error(env, e))?;

    let uri = env
      .call_method(
        &resolver,
        "insert",
        "(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;",
        &[JValue::Object(&collection), JValue::Object(&values)],
      )
      .and_then(|value| value.l())
      .map_err(|e| jni_util::jni_error(env, e))?;
    // `insert` answers `null` instead of throwing when the row cannot be
    // created — without this check the failure would show up much later, as a
    // `NullPointerException` on the stream.
    if uri.is_null() {
      return Err(format!("Android hat keinen Platz für „{name}“ angelegt."));
    }

    write_stream(env, &resolver, &uri, bytes)?;
    publish(env, &resolver, &uri, &values, &is_pending)?;
    Ok(format!("Downloads/{name}"))
  }

  /// `resolver.openOutputStream(uri)`, write, flush, close.
  fn write_stream(
    env: &mut JNIEnv,
    resolver: &JObject,
    uri: &JObject,
    bytes: &[u8],
  ) -> Result<(), String> {
    let stream = env
      .call_method(
        resolver,
        "openOutputStream",
        "(Landroid/net/Uri;)Ljava/io/OutputStream;",
        &[JValue::Object(uri)],
      )
      .and_then(|value| value.l())
      .map_err(|e| jni_util::jni_error(env, e))?;
    if stream.is_null() {
      return Err("Android hat den Schreibzugriff auf die Datei verweigert.".to_string());
    }

    let array = env
      .byte_array_from_slice(bytes)
      .map_err(|e| jni_util::jni_error(env, e))?;
    let written = env.call_method(&stream, "write", "([B)V", &[JValue::Object(&array)]);
    if written.is_ok() {
      let _ = env.call_method(&stream, "flush", "()V", &[]);
    }
    // Closed in every case: an early return would leave the row pending forever,
    // and a pending row is invisible to the user.
    let _ = env.call_method(&stream, "close", "()V", &[]);
    written.map_err(|e| jni_util::jni_error(env, e))?;
    Ok(())
  }

  /// `is_pending = 0` — the moment the file becomes visible in Downloads.
  /// `ContentValues.clear()` then reuses the same object for the update.
  fn publish(
    env: &mut JNIEnv,
    resolver: &JObject,
    uri: &JObject,
    values: &JObject,
    is_pending: &str,
  ) -> Result<(), String> {
    env
      .call_method(values, "clear", "()V", &[])
      .map_err(|e| jni_util::jni_error(env, e))?;
    put_string(env, values, is_pending, "0")?;
    let null = JObject::null();
    env
      .call_method(
        resolver,
        "update",
        "(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I",
        &[
          JValue::Object(uri),
          JValue::Object(values),
          JValue::Object(&null),
          JValue::Object(&null),
        ],
      )
      .map_err(|e| jni_util::jni_error(env, e))?;
    Ok(())
  }

  /// The fallback below API 29: the app's own external folder.
  ///
  /// Putting a file into the *public* Downloads folder would need
  /// `WRITE_EXTERNAL_STORAGE` there, which this app does not request — a
  /// permission prompt for one download button is not worth it. The app's own
  /// folder needs none; it is just harder to find, so the full path is
  /// answered and shown.
  fn write_to_app_folder(
    env: &mut JNIEnv,
    context: &JObject,
    name: &str,
    bytes: &[u8],
  ) -> Result<String, String> {
    let null = JObject::null();
    let dir = env
      .call_method(
        context,
        "getExternalFilesDir",
        "(Ljava/lang/String;)Ljava/io/File;",
        &[JValue::Object(&null)],
      )
      .and_then(|value| value.l())
      .map_err(|e| jni_util::jni_error(env, e))?;
    let dir = jni_util::path_of(env, &dir)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Ordner {dir:?}: {e}"))?;
    let path = dir.join(name);
    std::fs::write(&path, bytes).map_err(|e| format!("{name} schreiben: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
  }

  /// `ACTION_VIEW` on the `content://` URI, so a real viewer app opens it.
  fn view(env: &mut JNIEnv, context: &JObject, path: &Path, mime: &str) -> Result<(), String> {
    let uri = jni_util::content_uri(env, context, path)?;
    let intent = env
      .new_object("android/content/Intent", "()V", &[])
      .map_err(|e| jni_util::jni_error(env, e))?;
    let action = env
      .new_string("android.intent.action.VIEW")
      .map_err(|e| jni_util::jni_error(env, e))?;
    jni_util::set_object_arg(
      env,
      &intent,
      "setAction",
      jni_util::INTENT_STRING_ARG,
      &action,
    )?;
    let mime = env.new_string(mime).map_err(|e| jni_util::jni_error(env, e))?;
    // `setDataAndType` in one call — `setData` alone would reset the type to
    // null, and a null type makes the receiver refuse the URI.
    env
      .call_method(
        &intent,
        "setDataAndType",
        "(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;",
        &[JValue::Object(&uri), JValue::Object(&mime)],
      )
      .map_err(|e| jni_util::jni_error(env, e))?;
    jni_util::add_flags(
      env,
      &intent,
      jni_util::FLAG_ACTIVITY_NEW_TASK | jni_util::FLAG_GRANT_READ_URI_PERMISSION,
    )?;

    // No viewer at all is the only way this fails: with several matches
    // Android puts up its own resolver, and with one it starts it. So a
    // `createChooser` fallback would only ever be reached when there is nothing
    // to choose — the honest answer is a sentence the user can act on.
    jni_util::start_activity(env, context, &intent).map_err(|_| {
      "Auf diesem Gerät gibt es keine App zum Öffnen der Datei — nutze „Download“.".to_string()
    })?;
    Ok(())
  }

  fn put_string(env: &mut JNIEnv, values: &JObject, key: &str, value: &str) -> Result<(), String> {
    let key = env.new_string(key).map_err(|e| jni_util::jni_error(env, e))?;
    let value = env.new_string(value).map_err(|e| jni_util::jni_error(env, e))?;
    env
      .call_method(
        values,
        "put",
        "(Ljava/lang/String;Ljava/lang/String;)V",
        &[JValue::Object(&key), JValue::Object(&value)],
      )
      .map_err(|e| jni_util::jni_error(env, e))?;
    Ok(())
  }
}
