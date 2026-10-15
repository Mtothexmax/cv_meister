//! JNI plumbing shared by the Android-only commands.
//!
//! Two modules reach into Android because the WebView cannot: `gmail_share`
//! hands a draft with attachments to the Gmail app, `file_share` saves and
//! opens a file. What they have in common is exactly the fiddly part — the
//! application context, the `FileProvider` dance, the class loader, and turning
//! a pending Java exception into a readable message — so it lives here instead
//! of twice.
//!
//! The module is Android-only (`mod android` in `lib.rs` is `cfg`-gated),
//! because `jni` and `ndk-context` are target-specific dependencies.

use base64::Engine;
use jni::objects::{JClass, JObject, JString, JValue};
use jni::{JNIEnv, JavaVM};
use std::path::{Path, PathBuf};

/// The provider declared in the generated manifest. It lives in the app's own
/// class loader, which `FindClass` does not consult on a native thread.
pub const FILE_PROVIDER: &str = "androidx.core.content.FileProvider";

/// `Intent.FLAG_ACTIVITY_NEW_TASK`. The context behind `ndk_context` is the
/// *application* context (that is what `tao` stores), and only an Activity may
/// start an activity without this flag.
pub const FLAG_ACTIVITY_NEW_TASK: i32 = 0x1000_0000;

/// `Intent.FLAG_GRANT_READ_URI_PERMISSION` — without it the receiving app cannot
/// open the `content://` URIs we hand it.
pub const FLAG_GRANT_READ_URI_PERMISSION: i32 = 0x0000_0001;

/// `Intent` setters that take one `String` and hand the intent back.
pub const INTENT_STRING_ARG: &str = "(Ljava/lang/String;)Landroid/content/Intent;";

/// Runs `f` with a JNI environment and the application context.
///
/// Every native entry point goes through this, so the two facts that are easy
/// to get wrong are stated once:
///
/// * `FindClass` on a native thread only resolves boot-class-path names, hence
///   [`file_provider`] loading the class through the app's own loader.
/// * the pointers behind `ndk_context` are set up once by `tao` before any
///   command runs and stay valid for the lifetime of the process.
pub fn with_context<T>(
  f: impl FnOnce(&mut JNIEnv, &JObject) -> Result<T, String>,
) -> Result<T, String> {
  // Panics only if `tao` never ran `onCreate` — impossible for a command, which
  // can only be invoked once the webview exists.
  let ctx = ndk_context::android_context();
  // SAFETY: see the doc comment above.
  let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }
    .map_err(|e| format!("Keine Java-Umgebung: {e}"))?;
  let mut env = vm
    .attach_current_thread()
    .map_err(|e| format!("Thread nicht an Java gebunden: {e}"))?;
  let context = unsafe { JObject::from_raw(ctx.context().cast()) };
  f(&mut env, &context)
}

/// Moves a blocking JNI call off the async runtime's worker threads.
///
/// JNI binds to the *calling* thread, and the runtime's workers are not the ones
/// `tao` attached. A panic (there should not be one) also surfaces here as a
/// failed task instead of taking the process down.
pub async fn run<T: Send + 'static>(
  f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f)
    .await
    .map_err(|e| format!("Aufgabe abgebrochen: {e}"))?
}

/// `Build.VERSION.SDK_INT` — the API level the app is really running on.
///
/// Read rather than assumed: the same APK has to behave differently on the two
/// sides of the API 29 line, and `minSdk` only says what is *allowed*.
pub fn sdk_int(env: &mut JNIEnv) -> Result<i32, String> {
  let class = env
    .find_class("android/os/Build$VERSION")
    .map_err(|e| jni_error(env, e))?;
  env
    .get_static_field(&class, "SDK_INT", "I")
    .and_then(|value| value.i())
    .map_err(|e| jni_error(env, e))
}

/// `FileProvider.getUriForFile(context, authority, file)`.
///
/// The authority has to match the one the generated manifest declares for the
/// provider — `<applicationId>.fileprovider`, which is the *debug* package name
/// in a debug build, hence reading it rather than assuming it.
///
/// A receiving app can only read a `content://` URI, and such a URI only exists
/// for a file that is really on disk — callers write their bytes out first.
pub fn content_uri<'local>(
  env: &mut JNIEnv<'local>,
  context: &JObject,
  path: &Path,
) -> Result<JObject<'local>, String> {
  let authority_name = format!("{}.fileprovider", package_name(env, context)?);
  let authority = env
    .new_string(authority_name)
    .map_err(|e| jni_error(env, e))?;
  let provider = file_provider(env, context)?;
  let java_file = new_file(env, path)?;
  env
    .call_static_method(
      &provider,
      "getUriForFile",
      "(Landroid/content/Context;Ljava/lang/String;Ljava/io/File;)Landroid/net/Uri;",
      &[
        JValue::Object(context),
        JValue::Object(&authority),
        JValue::Object(&java_file),
      ],
    )
    .and_then(|value| value.l())
    .map_err(|e| jni_error(env, e))
}

/// `androidx.core.content.FileProvider` loaded through the app's class loader.
pub fn file_provider<'local>(
  env: &mut JNIEnv<'local>,
  context: &JObject,
) -> Result<JClass<'local>, String> {
  let loader = env
    .call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
    .and_then(|value| value.l())
    .map_err(|e| jni_error(env, e))?;
  let name = env.new_string(FILE_PROVIDER).map_err(|e| jni_error(env, e))?;
  let class = env
    .call_method(
      &loader,
      "loadClass",
      "(Ljava/lang/String;)Ljava/lang/Class;",
      &[JValue::Object(&name)],
    )
    .and_then(|value| value.l())
    .map_err(|e| jni_error(env, e))?;
  Ok(JClass::from(class))
}

/// The application id, which is also the `FileProvider` authority's prefix.
pub fn package_name(env: &mut JNIEnv, context: &JObject) -> Result<String, String> {
  let value = env
    .call_method(context, "getPackageName", "()Ljava/lang/String;", &[])
    .and_then(|value| value.l())
    .map_err(|e| jni_error(env, e))?;
  let value = JString::from(value);
  let name: String = env.get_string(&value).map_err(|e| jni_error(env, e))?.into();
  Ok(name)
}

/// `File.getAbsolutePath()` as a Rust path.
pub fn path_of(env: &mut JNIEnv, file: &JObject) -> Result<PathBuf, String> {
  let value = env
    .call_method(file, "getAbsolutePath", "()Ljava/lang/String;", &[])
    .and_then(|value| value.l())
    .map_err(|e| jni_error(env, e))?;
  let value = JString::from(value);
  let path: String = env.get_string(&value).map_err(|e| jni_error(env, e))?.into();
  Ok(PathBuf::from(path))
}

/// `new java.io.File(path)`.
pub fn new_file<'local>(env: &mut JNIEnv<'local>, path: &Path) -> Result<JObject<'local>, String> {
  let name = env
    .new_string(path.to_string_lossy().as_ref())
    .map_err(|e| jni_error(env, e))?;
  env
    .new_object(
      "java/io/File",
      "(Ljava/lang/String;)V",
      &[JValue::Object(&name)],
    )
    .map_err(|e| jni_error(env, e))
}

/// Starts an activity from the application context.
///
/// A failure is the *expected* case when nothing can handle the intent, so the
/// pending exception is dropped quietly: leaving it pending would make the next
/// JNI call fail with a confusing follow-up error instead.
pub fn start_activity(
  env: &mut JNIEnv,
  context: &JObject,
  intent: &JObject,
) -> Result<(), String> {
  match env.call_method(
    context,
    "startActivity",
    "(Landroid/content/Intent;)V",
    &[JValue::Object(intent)],
  ) {
    Ok(_) => Ok(()),
    Err(e) => {
      let _ = env.exception_clear();
      Err(format!("startActivity: {e}"))
    }
  }
}

/// `Intent.createChooser(intent, title)` — the fallback when nothing handles the
/// intent directly, or when several apps do.
pub fn chooser<'local>(
  env: &mut JNIEnv<'local>,
  intent: JObject<'local>,
  title: &str,
) -> Result<JObject<'local>, String> {
  let title = env.new_string(title).map_err(|e| jni_error(env, e))?;
  let chooser = env
    .call_static_method(
      "android/content/Intent",
      "createChooser",
      "(Landroid/content/Intent;Ljava/lang/CharSequence;)Landroid/content/Intent;",
      &[JValue::Object(&intent), JValue::Object(&title)],
    )
    .and_then(|value| value.l())
    .map_err(|e| jni_error(env, e))?;
  // The chooser is what gets started, so it needs the flag itself — flags set on
  // the inner intent do not reach it.
  add_flags(env, &chooser, FLAG_ACTIVITY_NEW_TASK)?;
  Ok(chooser)
}

/// `intent.addFlags(flags)`.
pub fn add_flags(env: &mut JNIEnv, intent: &JObject, flags: i32) -> Result<(), String> {
  env
    .call_method(
      intent,
      "addFlags",
      "(I)Landroid/content/Intent;",
      &[JValue::Int(flags)],
    )
    .map_err(|e| jni_error(env, e))?;
  Ok(())
}

/// A setter that takes one object and returns the intent.
///
/// The signature is passed in rather than derived: JNI looks a method up by name
/// *and* signature, so handing it the wrong parameter type does not fail at
/// compile time — it fails at runtime with `NoSuchMethodError`. Being explicit
/// at the call site is what keeps that visible.
pub fn set_object_arg(
  env: &mut JNIEnv,
  intent: &JObject,
  method: &str,
  signature: &str,
  value: &JObject,
) -> Result<(), String> {
  env
    .call_method(intent, method, signature, &[JValue::Object(value)])
    .map_err(|e| jni_error(env, e))?;
  Ok(())
}

/// Decodes one base64 payload from the IPC layer.
///
/// `what` names the file in the error message: the raw base64 error says nothing
/// about *which* attachment it came from.
pub fn decode_base64(data: &str, what: &str) -> Result<Vec<u8>, String> {
  base64::engine::general_purpose::STANDARD
    .decode(data.as_bytes())
    .map_err(|e| format!("{what} ist unlesbar: {e}"))
}

/// Only characters that would break a path are replaced; everything else —
/// umlauts included — is kept, so the name the user sees stays the real one.
pub fn safe_name(name: &str) -> String {
  let cleaned: String = name
    .chars()
    .map(|c| {
      if c == '/' || c == '\\' || c == ':' || c.is_control() {
        '_'
      } else {
        c
      }
    })
    .collect();
  let cleaned = cleaned.trim().trim_matches('.').to_string();
  if cleaned.is_empty() {
    "Datei".to_string()
  } else {
    cleaned
  }
}

/// Turns a JNI failure into a message. A pending Java exception is described (it
/// lands in logcat) and cleared: leaving it pending would make the *next* JNI
/// call fail with a confusing follow-up error instead.
pub fn jni_error(env: &mut JNIEnv, error: jni::errors::Error) -> String {
  if let Ok(true) = env.exception_check() {
    let _ = env.exception_describe();
    let _ = env.exception_clear();
    return format!("Android hat den Aufruf abgelehnt: {error}");
  }
  format!("Android-Aufruf fehlgeschlagen: {error}")
}
