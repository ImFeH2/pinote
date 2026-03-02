use log::info;
use serde::Deserialize;
use std::{collections::HashMap, collections::HashSet, sync::Mutex, thread, time::Duration};
use tauri::{Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const CACHE_VERSION: u32 = 1;
const NOTE_WINDOW_PREFIX: &str = "note-";
const NOTE_CONTEXT_MENU_WINDOW_SUFFIX: &str = "-context-menu";
const EXISTING_WINDOW_SHAKE_OFFSETS: [i32; 8] = [0, 14, -12, 10, -8, 6, -4, 0];
const EXISTING_WINDOW_SHAKE_DELAY_MS: u64 = 14;

#[derive(Default)]
pub struct VisibleWindowToggleState(pub Mutex<Vec<String>>);

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

fn update_window_visibility_in_cache(
    app: &tauri::AppHandle,
    window_labels: &[String],
    visibility: &str,
    push_hidden_to_top: bool,
) {
    if window_labels.is_empty() {
        return;
    }
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };
    let cache_file = app_data_dir.join("windows.json");
    let Ok(content) = std::fs::read_to_string(&cache_file) else {
        return;
    };
    let Ok(mut cache_json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return;
    };
    let Some(cache_object) = cache_json.as_object_mut() else {
        return;
    };
    let Some(windows_object) = cache_object
        .get_mut("windows")
        .and_then(serde_json::Value::as_object_mut)
    else {
        return;
    };
    let label_set = window_labels
        .iter()
        .map(|label| label.as_str())
        .collect::<HashSet<_>>();
    let mut matched_keys = Vec::new();
    for (cache_key, state_value) in windows_object.iter_mut() {
        let Some(state_object) = state_value.as_object_mut() else {
            continue;
        };
        let window_id = state_object
            .get("windowId")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .trim();
        if !label_set.contains(window_id) {
            continue;
        }
        state_object.insert(
            String::from("visibility"),
            serde_json::Value::String(visibility.to_string()),
        );
        matched_keys.push(cache_key.clone());
    }
    if matched_keys.is_empty() {
        return;
    }
    let matched_set = matched_keys
        .iter()
        .map(|key| key.as_str())
        .collect::<HashSet<_>>();
    if visibility == "hidden" {
        let hidden_stack_value = cache_object
            .entry(String::from("hiddenStack"))
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        if let Some(hidden_stack) = hidden_stack_value.as_array_mut() {
            hidden_stack.retain(|item| match item.as_str() {
                Some(value) => !matched_set.contains(value),
                None => true,
            });
            if push_hidden_to_top {
                hidden_stack.extend(matched_keys.iter().cloned().map(serde_json::Value::String));
            }
        }
    } else if let Some(hidden_stack) = cache_object
        .get_mut("hiddenStack")
        .and_then(serde_json::Value::as_array_mut)
    {
        hidden_stack.retain(|item| match item.as_str() {
            Some(value) => !matched_set.contains(value),
            None => true,
        });
    }
    if let Ok(serialized) = serde_json::to_string_pretty(&cache_json) {
        let _ = std::fs::write(cache_file, serialized);
    }
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

fn visible_note_window_labels(app: &tauri::AppHandle) -> Vec<String> {
    let mut labels = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| is_note_window_label(label))
        .filter_map(|(label, window)| match window.is_visible() {
            Ok(true) => Some(label),
            _ => None,
        })
        .collect::<Vec<_>>();
    labels.sort();
    labels
}

fn focus_and_shake_all_note_windows(app: &tauri::AppHandle) {
    let labels = visible_note_window_labels(app);
    for label in labels {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        focus_and_shake_window(&window);
    }
}

fn hidden_note_window_labels(cache: &WindowStateCache) -> Vec<String> {
    let mut labels = Vec::new();
    let mut seen = HashSet::new();
    for cache_key in &cache.hidden_stack {
        let Some(state) = cache.windows.get(cache_key) else {
            continue;
        };
        if state.visibility != "hidden" {
            continue;
        }
        let label = state.window_id.trim();
        if label.is_empty() {
            continue;
        }
        if !seen.insert(label.to_string()) {
            continue;
        }
        labels.push(label.to_string());
    }
    for state in cache.windows.values() {
        if state.visibility != "hidden" {
            continue;
        }
        let label = state.window_id.trim();
        if label.is_empty() {
            continue;
        }
        if !seen.insert(label.to_string()) {
            continue;
        }
        labels.push(label.to_string());
    }
    labels
}

pub fn toggle_visible_note_windows(app: &tauri::AppHandle) {
    let state = app.state::<VisibleWindowToggleState>();
    let mut snapshot = match state.0.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let visible_labels = visible_note_window_labels(app);
    if !visible_labels.is_empty() {
        *snapshot = visible_labels.clone();
        drop(snapshot);
        update_window_visibility_in_cache(app, &visible_labels, "hidden", true);
        for label in visible_labels {
            let Some(window) = app.get_webview_window(&label) else {
                continue;
            };
            let _ = window.hide();
        }
        return;
    }
    if snapshot.is_empty() {
        return;
    }
    let labels_to_restore = snapshot.clone();
    snapshot.clear();
    drop(snapshot);
    update_window_visibility_in_cache(app, &labels_to_restore, "visible", false);
    let last_index = labels_to_restore.len().saturating_sub(1);
    for (index, label) in labels_to_restore.into_iter().enumerate() {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        let _ = window.show();
        if index == last_index {
            let _ = window.set_focus();
        }
    }
}

pub fn restore_latest_hidden_window(app: &tauri::AppHandle) -> bool {
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
            update_window_visibility_in_cache(
                app,
                std::slice::from_ref(&state.window_id),
                "visible",
                false,
            );
            focus_and_shake_window(&window);
            return true;
        }
    }
    false
}

pub fn restore_hidden_window(app: &tauri::AppHandle) {
    if restore_latest_hidden_window(app) {
        return;
    }
    focus_and_shake_all_note_windows(app);
}

pub fn show_all_hidden_windows(app: &tauri::AppHandle) {
    let Some(cache) = load_window_state_cache(app) else {
        return;
    };
    let labels_to_restore = hidden_note_window_labels(&cache);
    if labels_to_restore.is_empty() {
        return;
    }
    update_window_visibility_in_cache(app, &labels_to_restore, "visible", false);
    let last_index = labels_to_restore.len().saturating_sub(1);
    for (index, label) in labels_to_restore.into_iter().enumerate() {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        let _ = window.show();
        if index == last_index {
            let _ = window.set_focus();
        }
    }
}

pub fn show_settings_window(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    if let Some(window) = app.get_webview_window("settings") {
        info!("settings_window_show_existing");
        let was_always_on_top = window.is_always_on_top().unwrap_or(false);
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.show();
        let _ = window.set_focus();
        if !was_always_on_top {
            let _ = window.set_always_on_top(true);
            let _ = window.set_always_on_top(false);
        }
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
    let _ = window.show();
    let _ = window.set_focus();

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
