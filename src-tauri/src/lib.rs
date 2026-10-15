#[cfg(target_os = "android")]
mod android;
mod file_share;
mod gmail_share;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Only `allow-read-text` is granted in capabilities/default.json: writing
    // stays on the WebView path, which works everywhere.
    .plugin(tauri_plugin_clipboard_manager::init())
    // The Android-only commands; each module says why the WebView cannot do it
    // itself — it has neither a mail intent nor a download manager nor a PDF
    // viewer.
    .invoke_handler(tauri::generate_handler![
      gmail_share::open_in_gmail,
      file_share::save_file,
      file_share::open_file
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
