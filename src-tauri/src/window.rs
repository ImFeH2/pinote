use log::info;
use serde::Deserialize;
use std::collections::HashMap;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const CACHE_VERSION: u32 = 2;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedWindowState {
    window_id: String,
    visibility: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowStateCache {
    version: u32,
    windows: HashMap<String, CachedWindowState>,
    hidden_stack: Vec<String>,
}

fn load_window_state_cache(app: &tauri::AppHandle) -> Option<WindowStateCache> {
    let app_data_dir = app.path().app_data_dir().ok()?;
    let cache_file = app_data_dir.join("windows.json");
    let content = std::fs::read_to_string(cache_file).ok()?;
    let cache = serde_json::from_str::<WindowStateCache>(&content).ok()?;
    if cache.version != CACHE_VERSION {
        return None;
    }
    Some(cache)
}

pub fn restore_hidden_window(app: &tauri::AppHandle) {
    let Some(cache) = load_window_state_cache(app) else {
        return;
    };

    for cache_key in cache.hidden_stack.iter().rev() {
        let Some(state) = cache.windows.get(cache_key) else {
            continue;
        };
        if state.visibility != "hidden" {
            continue;
        }
        let Some(window) = app.get_webview_window(&state.window_id) else {
            continue;
        };
        let _ = window.show();
        let _ = window.set_focus();
        break;
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
    .center()
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
