use log::info;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub fn toggle_window_visibility(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn show_settings_window(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    if let Some(window) = app.get_webview_window("settings") {
        info!("settings_window_show_existing");
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    info!("settings_window_create");
    let window = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html?view=settings".into()),
    )
    .title("Pinote Settings")
    .inner_size(920.0, 620.0)
    .decorations(false)
    .resizable(true)
    .min_inner_size(760.0, 520.0)
    .build()?;

    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            info!("settings_window_hide");
            let _ = window_clone.hide();
        }
    });

    Ok(())
}
