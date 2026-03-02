use log::info;
use serde::Deserialize;
use std::{collections::HashMap, thread, time::Duration};
use tauri::{Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const CACHE_VERSION: u32 = 1;
const NOTE_WINDOW_PREFIX: &str = "note-";
const NOTE_CONTEXT_MENU_WINDOW_SUFFIX: &str = "-context-menu";
const EXISTING_WINDOW_SHAKE_OFFSETS: [i32; 8] = [0, 14, -12, 10, -8, 6, -4, 0];
const EXISTING_WINDOW_SHAKE_DELAY_MS: u64 = 14;

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

fn is_note_window_label(label: &str) -> bool {
    label.starts_with(NOTE_WINDOW_PREFIX) && !label.ends_with(NOTE_CONTEXT_MENU_WINDOW_SUFFIX)
}

fn shake_window(window: &WebviewWindow) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let base_x = position.x;
    let base_y = position.y;
    for offset in EXISTING_WINDOW_SHAKE_OFFSETS {
        let _ = window.set_position(PhysicalPosition::new(base_x + offset, base_y));
        thread::sleep(Duration::from_millis(EXISTING_WINDOW_SHAKE_DELAY_MS));
    }
}

fn focus_and_shake_window(window: &WebviewWindow) {
    let _ = window.show();
    if window.set_focus().is_ok() {
        shake_window(window);
    }
}

fn focus_and_shake_all_note_windows(app: &tauri::AppHandle) {
    let mut windows = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| is_note_window_label(label))
        .collect::<Vec<_>>();
    windows.sort_by(|(left, _), (right, _)| left.cmp(right));
    for (_, window) in windows {
        let Ok(visible) = window.is_visible() else {
            continue;
        };
        if !visible {
            continue;
        }
        focus_and_shake_window(&window);
    }
}

pub fn restore_hidden_window(app: &tauri::AppHandle) {
    if let Some(cache) = load_window_state_cache(app) {
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
            focus_and_shake_window(&window);
            return;
        }
    }
    focus_and_shake_all_note_windows(app);
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
