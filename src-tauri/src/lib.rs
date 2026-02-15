mod shortcut;
mod tray;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![])
        .setup(|app| {
            let handle = app.handle().clone();
            tray::setup_tray(&handle)?;
            shortcut::setup_shortcuts(&handle)?;

            let window = app.get_webview_window("main").unwrap();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
