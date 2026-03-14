use log::info;
use std::{sync::Mutex, thread, time::Duration};
use tauri::{Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const NOTE_WINDOW_PREFIX: &str = "note-";
const NOTE_CONTEXT_MENU_WINDOW_SUFFIX: &str = "-context-menu";
const EXISTING_WINDOW_SHAKE_OFFSETS: [i32; 8] = [0, 14, -12, 10, -8, 6, -4, 0];
const EXISTING_WINDOW_SHAKE_DELAY_MS: u64 = 14;

use crate::window_state::{self, UpdateWindowStateOptions, WindowVisibility};

#[derive(Default)]
pub struct VisibleWindowToggleState(pub Mutex<Vec<String>>);

fn is_note_window_label(label: &str) -> bool {
    label.starts_with(NOTE_WINDOW_PREFIX) && !label.ends_with(NOTE_CONTEXT_MENU_WINDOW_SUFFIX)
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

fn shake_visible_note_windows_simultaneously(app: &tauri::AppHandle) {
    let labels = visible_note_window_labels(app);
    let mut windows = Vec::new();
    for label in labels {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        let Ok(position) = window.outer_position() else {
            continue;
        };
        windows.push((window, position.x, position.y));
    }
    if windows.is_empty() {
        return;
    }
    for offset in EXISTING_WINDOW_SHAKE_OFFSETS {
        for (window, base_x, base_y) in &windows {
            let _ = window.set_position(PhysicalPosition::new(*base_x + offset, *base_y));
        }
        thread::sleep(Duration::from_millis(EXISTING_WINDOW_SHAKE_DELAY_MS));
    }
}

fn bring_visible_note_windows_to_front(app: &tauri::AppHandle) {
    let labels = visible_note_window_labels(app);
    for label in labels {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let was_always_on_top = window.is_always_on_top().unwrap_or(false);
        let _ = window.show();
        let _ = window.set_focus();
        if !was_always_on_top {
            let _ = window.set_always_on_top(true);
            let _ = window.set_always_on_top(false);
        }
    }
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
        let _ = window_state::set_window_visibility_by_labels(
            app,
            &visible_labels,
            WindowVisibility::Hidden,
            UpdateWindowStateOptions {
                push_hidden_to_top: Some(true),
            },
        );
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
    let _ = window_state::set_window_visibility_by_labels(
        app,
        &labels_to_restore,
        WindowVisibility::Visible,
        UpdateWindowStateOptions::default(),
    );
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
    if let Ok(Some(state)) = window_state::get_most_recent_hidden_window_state(app) {
        let Some(window) = app.get_webview_window(&state.window_id) else {
            return false;
        };
        let _ = window_state::set_window_visibility(
            app,
            &state.window_id,
            WindowVisibility::Visible,
            UpdateWindowStateOptions::default(),
        );
        let _ = window.show();
        let _ = window.set_focus();
        return true;
    }
    false
}

pub fn restore_hidden_window(app: &tauri::AppHandle) {
    if restore_latest_hidden_window(app) {
        return;
    }
    bring_visible_note_windows_to_front(app);
    shake_visible_note_windows_simultaneously(app);
}

pub fn show_all_hidden_windows(app: &tauri::AppHandle) {
    let labels_to_restore = match window_state::list_hidden_window_ids(app) {
        Ok(value) => value,
        Err(_) => {
            shake_visible_note_windows_simultaneously(app);
            return;
        }
    };
    if labels_to_restore.is_empty() {
        shake_visible_note_windows_simultaneously(app);
        return;
    }
    let _ = window_state::set_window_visibility_by_labels(
        app,
        &labels_to_restore,
        WindowVisibility::Visible,
        UpdateWindowStateOptions::default(),
    );
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
