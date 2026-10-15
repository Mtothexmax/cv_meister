//! Handing a pre-filled draft to Gmail on Android.
//!
//! The WebView cannot do this on its own. `navigator.share` is not implemented
//! in the Android WebView, and a `mailto:` link carries text but no
//! attachments — and the attachments are the point of an application mail. So
//! the Android app passes the message to Gmail through a native
//! `ACTION_SEND` / `ACTION_SEND_MULTIPLE` intent instead.
//!
//! This lives in tracked Rust rather than in the generated Android project
//! (`src-tauri/gen`, gitignored) because a Kotlin change there would vanish on
//! the next `tauri android init`. The JNI plumbing it shares with
//! `file_share.rs` sits in `crate::android`.
//!
//! One detail is easy to get wrong and is worth stating up front: the PDFs are
//! written to the cache directory first, because a receiving app can only read a
//! `content://` URI and such a URI only exists for a file that is really on
//! disk. The provider and the paths it exposes come from the generated manifest
//! (`<cache-path name="my_cache_images" path="." />`), which covers the whole
//! cache directory.

// On the desktop the draft is only ever accepted and then rejected, so its
// fields are deliberately unread there.
#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use serde::Deserialize;
#[cfg(target_os = "android")]
use tauri::Manager;

/// One file to attach. `data` is base64 because the IPC layer is JSON.
#[derive(Debug, Deserialize)]
pub struct MailAttachment {
  pub filename: String,
  pub data: String,
}

/// The draft to hand over — the same content the `.eml` carries.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailDraft {
  pub to: String,
  pub subject: String,
  /// Plain-text body.
  pub body: String,
  /// The same body as minimal HTML, so Gmail shows the line breaks.
  pub body_html: String,
  pub attachments: Vec<MailAttachment>,
}

/// Opens Gmail with a pre-filled draft, attachments included.
///
/// Gmail is targeted directly when it is installed; otherwise the system
/// chooser lists whatever can send a mail with attachments, so the button stays
/// useful on a phone without Gmail.
#[tauri::command]
pub async fn open_in_gmail(app: tauri::AppHandle, draft: GmailDraft) -> Result<(), String> {
  #[cfg(target_os = "android")]
  {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    crate::android::run(move || android::send(&cache_dir, &draft)).await
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = (app, draft);
    Err("„In Gmail öffnen“ gibt es nur in der Android-App.".to_string())
  }
}

#[cfg(target_os = "android")]
mod android {
  use super::GmailDraft;
  use crate::android as jni_util;
  use jni::objects::{JObject, JValue};
  use jni::JNIEnv;
  use std::path::{Path, PathBuf};

  /// Preferred target. Without the class name below, the whole package is
  /// addressed; without either, the share sheet is shown instead of failing.
  const GMAIL_PACKAGE: &str = "com.google.android.gm";
  /// Gmail's externally reachable composer. Gmail registers *two* handlers for
  /// `ACTION_SEND_MULTIPLE` (`*/*`) — this one and Google Chat's
  /// `com.google.android.apps.dynamite.DynamiteDeepLinkMultiple` — so the
  /// package alone leaves Android showing its resolver.
  const GMAIL_COMPOSE: &str = "com.google.android.gm.ComposeActivityGmailExternal";

  const ACTION_SEND: &str = "android.intent.action.SEND";
  const ACTION_SEND_MULTIPLE: &str = "android.intent.action.SEND_MULTIPLE";
  const EXTRA_EMAIL: &str = "android.intent.extra.EMAIL";
  const EXTRA_SUBJECT: &str = "android.intent.extra.SUBJECT";
  const EXTRA_TEXT: &str = "android.intent.extra.TEXT";
  const EXTRA_HTML_TEXT: &str = "android.intent.extra.HTML_TEXT";
  const EXTRA_STREAM: &str = "android.intent.extra.STREAM";

  /// Sub-directory of the cache that holds the handed-over drafts.
  const SHARE_DIR: &str = "gmail-draft";
  const CLIP_LABEL: &str = "CV Meister";
  const CHOOSER_TITLE: &str = "Mit Gmail verfassen";

  /// The one `Intent` setter whose return type is *not* the intent.
  /// `setClipData` returns `void` (`javap` on `android-37.0/android.jar`:
  /// `public void setClipData(ClipData)`), so it must not be given the
  /// `…Landroid/content/Intent;` signature the others use.
  const INTENT_CLIP_ARG: &str = "(Landroid/content/ClipData;)V";

  /// Writes the attachments to the cache and fires the intent.
  pub fn send(cache_dir: &Path, draft: &GmailDraft) -> Result<(), String> {
    let files = write_attachments(cache_dir, draft)?;
    jni_util::with_context(|env, context| hand_over(env, context, draft, &files))
  }

  fn hand_over(
    env: &mut JNIEnv,
    context: &JObject,
    draft: &GmailDraft,
    files: &[PathBuf],
  ) -> Result<(), String> {
    let mut uris = Vec::with_capacity(files.len());
    for file in files {
      uris.push(jni_util::content_uri(env, context, file)?);
    }

    let intent = new_intent(env, draft, &uris)?;
    grant_read_access(env, &intent, &uris)?;

    // Straight to Gmail; the share sheet only if Gmail is not there at all.
    if start_in_gmail(env, context, &intent).is_err() {
      let target = jni_util::chooser(env, intent, CHOOSER_TITLE)?;
      jni_util::start_activity(env, context, &target)?;
    }
    Ok(())
  }

  /// Points the draft at Gmail and starts it; `Err` when Gmail is not there.
  ///
  /// Deliberately *not* asking first whether Gmail is installed: from API 30 on
  /// (this app targets 37) Android's package visibility hides other apps unless
  /// they are listed under `<queries>` in the manifest, so
  /// `getLaunchIntentForPackage` reports "not installed" even when Gmail is
  /// right there. *Starting* a foreign activity is not affected by that
  /// filtering, so this just tries, and the caller falls back to the share
  /// sheet when both attempts fail.
  ///
  /// Two attempts, in this order:
  ///
  /// 1. Gmail's own composer, by class name. The package alone is not enough:
  ///    Gmail answers `ACTION_SEND_MULTIPLE` from *two* activities — this one
  ///    and Google Chat's `DynamiteDeepLinkMultiple` — so Android finds two
  ///    matches and puts up its resolver instead of going straight to the
  ///    composer.
  /// 2. The package as a whole, for a Gmail that moved its composer. The
  ///    component has to be cleared first, or it keeps winning over the
  ///    package.
  fn start_in_gmail(env: &mut JNIEnv, context: &JObject, intent: &JObject) -> Result<(), String> {
    if set_class_name(env, intent).and_then(|()| jni_util::start_activity(env, context, intent)).is_ok() {
      return Ok(());
    }
    clear_component(env, intent)?;
    set_package(env, intent).and_then(|()| jni_util::start_activity(env, context, intent))
  }

  /// `intent.setClassName("com.google.android.gm", …ComposeActivityGmailExternal)`.
  fn set_class_name(env: &mut JNIEnv, intent: &JObject) -> Result<(), String> {
    let package = env.new_string(GMAIL_PACKAGE).map_err(|e| jni_util::jni_error(env, e))?;
    let class = env.new_string(GMAIL_COMPOSE).map_err(|e| jni_util::jni_error(env, e))?;
    env
      .call_method(
        intent,
        "setClassName",
        "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
        &[JValue::Object(&package), JValue::Object(&class)],
      )
      .map_err(|e| jni_util::jni_error(env, e))?;
    Ok(())
  }

  fn set_package(env: &mut JNIEnv, intent: &JObject) -> Result<(), String> {
    let package = env.new_string(GMAIL_PACKAGE).map_err(|e| jni_util::jni_error(env, e))?;
    jni_util::set_object_arg(env, intent, "setPackage", jni_util::INTENT_STRING_ARG, &package)
  }

  /// `intent.setComponent(null)` — the undo for `setClassName`.
  fn clear_component(env: &mut JNIEnv, intent: &JObject) -> Result<(), String> {
    env
      .call_method(
        intent,
        "setComponent",
        "(Landroid/content/ComponentName;)Landroid/content/Intent;",
        &[JValue::Object(&JObject::null())],
      )
      .map_err(|e| jni_util::jni_error(env, e))?;
    Ok(())
  }

  /// The intent itself: recipient, subject, both bodies, and the streams.
  fn new_intent<'local>(
    env: &mut JNIEnv<'local>,
    draft: &GmailDraft,
    uris: &[JObject<'local>],
  ) -> Result<JObject<'local>, String> {
    let with_files = !uris.is_empty();
    let intent = env
      .new_object("android/content/Intent", "()V", &[])
      .map_err(|e| jni_util::jni_error(env, e))?;

    // `ACTION_SEND_MULTIPLE` is the only action that accepts more than one
    // stream; `*/*` is what such a mixed send has to declare.
    let action = env
      .new_string(if with_files { ACTION_SEND_MULTIPLE } else { ACTION_SEND })
      .map_err(|e| jni_util::jni_error(env, e))?;
    jni_util::set_object_arg(env, &intent, "setAction", jni_util::INTENT_STRING_ARG, &action)?;
    let mime = env
      .new_string(if with_files { "*/*" } else { "text/html" })
      .map_err(|e| jni_util::jni_error(env, e))?;
    jni_util::set_object_arg(env, &intent, "setType", jni_util::INTENT_STRING_ARG, &mime)?;

    put_string(env, &intent, EXTRA_SUBJECT, &draft.subject)?;
    put_string(env, &intent, EXTRA_TEXT, &draft.body)?;
    put_string(env, &intent, EXTRA_HTML_TEXT, &draft.body_html)?;

    // A missing address is simply left out, so Gmail opens an empty To field
    // rather than one holding an empty string.
    if !draft.to.trim().is_empty() {
      let recipients = env
        .new_object_array(1, "java/lang/String", JObject::null())
        .map_err(|e| jni_util::jni_error(env, e))?;
      let address = env.new_string(&draft.to).map_err(|e| jni_util::jni_error(env, e))?;
      env
        .set_object_array_element(&recipients, 0, &address)
        .map_err(|e| jni_util::jni_error(env, e))?;
      let key = env.new_string(EXTRA_EMAIL).map_err(|e| jni_util::jni_error(env, e))?;
      env
        .call_method(
          &intent,
          "putExtra",
          "(Ljava/lang/String;[Ljava/lang/String;)Landroid/content/Intent;",
          &[JValue::Object(&key), JValue::Object(&recipients)],
        )
        .map_err(|e| jni_util::jni_error(env, e))?;
    }

    if with_files {
      let list = env
        .new_object("java/util/ArrayList", "()V", &[])
        .map_err(|e| jni_util::jni_error(env, e))?;
      for uri in uris {
        env
          .call_method(&list, "add", "(Ljava/lang/Object;)Z", &[JValue::Object(uri)])
          .map_err(|e| jni_util::jni_error(env, e))?;
      }
      let key = env.new_string(EXTRA_STREAM).map_err(|e| jni_util::jni_error(env, e))?;
      env
        .call_method(
          &intent,
          "putParcelableArrayListExtra",
          "(Ljava/lang/String;Ljava/util/ArrayList;)Landroid/content/Intent;",
          &[JValue::Object(&key), JValue::Object(&list)],
        )
        .map_err(|e| jni_util::jni_error(env, e))?;
    }
    Ok(intent)
  }

  /// Android propagates a URI read grant from `ClipData`, and only from there —
  /// `EXTRA_STREAM` on its own grants nothing. Every stream has to be in the
  /// clip, not just the first, or the receiver reports "permission denied" for
  /// the rest.
  fn grant_read_access(env: &mut JNIEnv, intent: &JObject, uris: &[JObject]) -> Result<(), String> {
    if uris.is_empty() {
      return Ok(());
    }
    let label = env.new_string(CLIP_LABEL).map_err(|e| jni_util::jni_error(env, e))?;
    let mime = env.new_string("*/*").map_err(|e| jni_util::jni_error(env, e))?;
    let mime_types = env
      .new_object_array(1, "java/lang/String", JObject::null())
      .map_err(|e| jni_util::jni_error(env, e))?;
    env
      .set_object_array_element(&mime_types, 0, &mime)
      .map_err(|e| jni_util::jni_error(env, e))?;

    let first = clip_item(env, &uris[0])?;
    let clip = env
      .new_object(
        "android/content/ClipData",
        "(Ljava/lang/CharSequence;[Ljava/lang/String;Landroid/content/ClipData$Item;)V",
        &[
          JValue::Object(&label),
          JValue::Object(&mime_types),
          JValue::Object(&first),
        ],
      )
      .map_err(|e| jni_util::jni_error(env, e))?;
    for uri in &uris[1..] {
      let item = clip_item(env, uri)?;
      env
        .call_method(
          &clip,
          "addItem",
          "(Landroid/content/ClipData$Item;)V",
          &[JValue::Object(&item)],
        )
        .map_err(|e| jni_util::jni_error(env, e))?;
    }

    jni_util::set_object_arg(env, intent, "setClipData", INTENT_CLIP_ARG, &clip)?;
    jni_util::add_flags(
      env,
      intent,
      jni_util::FLAG_ACTIVITY_NEW_TASK | jni_util::FLAG_GRANT_READ_URI_PERMISSION,
    )
  }

  fn clip_item<'local>(env: &mut JNIEnv<'local>, uri: &JObject) -> Result<JObject<'local>, String> {
    env
      .new_object(
        "android/content/ClipData$Item",
        "(Landroid/net/Uri;)V",
        &[JValue::Object(uri)],
      )
      .map_err(|e| jni_util::jni_error(env, e))
  }

  fn put_string(env: &mut JNIEnv, intent: &JObject, key: &str, value: &str) -> Result<(), String> {
    let key = env.new_string(key).map_err(|e| jni_util::jni_error(env, e))?;
    let value = env.new_string(value).map_err(|e| jni_util::jni_error(env, e))?;
    env
      .call_method(
        intent,
        "putExtra",
        "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
        &[JValue::Object(&key), JValue::Object(&value)],
      )
      .map_err(|e| jni_util::jni_error(env, e))?;
    Ok(())
  }

  fn write_attachments(cache_dir: &Path, draft: &GmailDraft) -> Result<Vec<PathBuf>, String> {
    let dir = cache_dir.join(SHARE_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Ordner für die Anhänge: {e}"))?;
    let mut files = Vec::with_capacity(draft.attachments.len());
    for (index, attachment) in draft.attachments.iter().enumerate() {
      let bytes = jni_util::decode_base64(&attachment.data, &format!("Anhang „{}“", attachment.filename))?;
      // The index keeps two documents of the same name apart; the name itself
      // stays readable because Gmail shows it on the attachment.
      let path = dir.join(format!("{index}-{}", jni_util::safe_name(&attachment.filename)));
      std::fs::write(&path, bytes)
        .map_err(|e| format!("Anhang „{}“ schreiben: {e}", attachment.filename))?;
      files.push(path);
    }
    Ok(files)
  }
}
