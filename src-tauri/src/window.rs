use log::{error, info};
use std::{thread, time::Duration};
use tauri::{Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use crate::window_state::{self, UpdateWindowStateOptions, WindowVisibility};
use crate::{
    NEW_NOTE_WINDOW_HEIGHT, NEW_NOTE_WINDOW_WIDTH, NOTE_WINDOW_HEIGHT, NOTE_WINDOW_MIN_HEIGHT,
    NOTE_WINDOW_MIN_WIDTH, NOTE_WINDOW_WIDTH, OpenNoteWindowOptions, build_note_window_id,
    build_note_window_url, capture_note_window_state, clamp_note_opacity, clamp_note_scroll_top,
    load_hide_note_windows_from_taskbar, shake_existing_window,
};

const NOTE_WINDOW_PREFIX: &str = "note-";
const NOTE_CONTEXT_MENU_WINDOW_SUFFIX: &str = "-context-menu";
const EXISTING_WINDOW_SHAKE_OFFSETS: [i32; 8] = [0, 14, -12, 10, -8, 6, -4, 0];
const EXISTING_WINDOW_SHAKE_DELAY_MS: u64 = 14;

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
    let visible_labels = visible_note_window_labels(app);
    if !visible_labels.is_empty() {
        info!(
            "toggle_visible_note_windows_hide_requested count={} labels={visible_labels:?}",
            visible_labels.len()
        );
        if let Err(err) = window_state::set_visible_window_toggle_snapshot(app, &visible_labels) {
            error!("toggle_visible_note_windows_snapshot_store_failed error={err}");
        }
        if let Err(err) = window_state::set_window_visibility_by_labels(
            app,
            &visible_labels,
            WindowVisibility::Hidden,
            UpdateWindowStateOptions {
                push_hidden_to_top: Some(true),
            },
        ) {
            error!("toggle_visible_note_windows_hide_state_failed error={err}");
        }
        for label in visible_labels {
            let Some(window) = app.get_webview_window(&label) else {
                continue;
            };
            let _ = window.hide();
        }
        info!("toggle_visible_note_windows_hide_completed");
        return;
    }
    let labels_to_restore = match window_state::list_visible_window_toggle_snapshot(app) {
        Ok(value) => value,
        Err(err) => {
            error!("toggle_visible_note_windows_snapshot_load_failed error={err}");
            Vec::new()
        }
    };
    if labels_to_restore.is_empty() {
        info!("toggle_visible_note_windows_restore_skipped reason=no_snapshot");
        return;
    }
    info!(
        "toggle_visible_note_windows_restore_requested count={} labels={labels_to_restore:?}",
        labels_to_restore.len()
    );
    if let Err(err) = window_state::clear_visible_window_toggle_snapshot(app) {
        error!("toggle_visible_note_windows_snapshot_clear_failed error={err}");
    }
    if let Err(err) = window_state::set_window_visibility_by_labels(
        app,
        &labels_to_restore,
        WindowVisibility::Visible,
        UpdateWindowStateOptions::default(),
    ) {
        error!("toggle_visible_note_windows_restore_state_failed error={err}");
    }
    let mut restored = 0usize;
    let mut missing = Vec::new();
    let mut last_restored_window = None;
    for label in labels_to_restore {
        let Some(window) = app.get_webview_window(&label) else {
            missing.push(label);
            continue;
        };
        let _ = window.show();
        restored += 1;
        last_restored_window = Some(window);
    }
    if let Some(window) = last_restored_window {
        let _ = window.set_focus();
    }
    info!(
        "toggle_visible_note_windows_restore_completed restored={restored} missing={}",
        missing.len()
    );
    if !missing.is_empty() {
        info!("toggle_visible_note_windows_restore_missing labels={missing:?}");
    }
}

pub fn restore_latest_hidden_window(app: &tauri::AppHandle) -> bool {
    if let Ok(Some(state)) = window_state::get_most_recent_hidden_window_state(app) {
        info!(
            "restore_latest_hidden_window_requested window_id={:?}",
            state.window_id
        );
        let Some(window) = app.get_webview_window(&state.window_id) else {
            info!(
                "restore_latest_hidden_window_missing_window window_id={:?}",
                state.window_id
            );
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
        info!(
            "restore_latest_hidden_window_completed window_id={:?}",
            state.window_id
        );
        return true;
    }
    false
}

pub fn restore_hidden_window(app: &tauri::AppHandle) {
    if restore_latest_hidden_window(app) {
        return;
    }
    info!("restore_hidden_window_no_hidden_window");
    bring_visible_note_windows_to_front(app);
    shake_visible_note_windows_simultaneously(app);
}

pub fn show_all_hidden_windows(app: &tauri::AppHandle) {
    let labels_to_restore = match window_state::list_hidden_window_ids(app) {
        Ok(value) => value,
        Err(_) => {
            info!("show_all_hidden_windows_failed_to_load_hidden_stack");
            shake_visible_note_windows_simultaneously(app);
            return;
        }
    };
    if labels_to_restore.is_empty() {
        info!("show_all_hidden_windows_skipped reason=no_hidden_window");
        shake_visible_note_windows_simultaneously(app);
        return;
    }
    info!(
        "show_all_hidden_windows_requested count={} labels={labels_to_restore:?}",
        labels_to_restore.len()
    );
    if let Err(err) = window_state::set_window_visibility_by_labels(
        app,
        &labels_to_restore,
        WindowVisibility::Visible,
        UpdateWindowStateOptions::default(),
    ) {
        error!("show_all_hidden_windows_state_failed error={err}");
    }
    let mut restored = 0usize;
    let mut last_restored_window = None;
    for label in labels_to_restore {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        let _ = window.show();
        restored += 1;
        last_restored_window = Some(window);
    }
    if let Some(window) = last_restored_window {
        let _ = window.set_focus();
    }
    info!("show_all_hidden_windows_completed restored={restored}");
}

pub fn show_settings_window(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    info!("show_settings_window_requested");
    let result = (|| -> Result<(), tauri::Error> {
        if let Some(window) = app.get_webview_window("settings") {
            info!("show_settings_window_reuse_existing");
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

        info!("show_settings_window_create_begin");
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
        info!("show_settings_window_create_built");
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
    })();
    match &result {
        Ok(_) => info!("show_settings_window_finished"),
        Err(err) => error!("show_settings_window_failed error={err}"),
    }
    result
}

pub fn open_note_window(
    app: tauri::AppHandle,
    note_id: String,
    options: Option<OpenNoteWindowOptions>,
) -> Result<window_state::CachedWindowState, String> {
    let options = options.unwrap_or_default();
    let normalized_note_id = note_id.trim().to_string();
    if normalized_note_id.is_empty() {
        return Err(String::from("noteId is required"));
    }
    let note_path = options
        .note_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| String::from("notePath is required"))?;
    let window_id = options
        .window_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| build_note_window_id(&note_path));
    let visibility = options
        .visibility
        .unwrap_or(window_state::WindowVisibility::Visible);
    let should_focus =
        visibility != window_state::WindowVisibility::Hidden && options.focus.unwrap_or(true);
    let read_only = options.read_only.unwrap_or(false);
    let opacity = clamp_note_opacity(options.opacity);
    let scroll_top = clamp_note_scroll_top(options.scroll_top);
    let center_on_create = options.center_on_create.unwrap_or(false);
    let skip_taskbar = options
        .skip_taskbar
        .unwrap_or_else(|| load_hide_note_windows_from_taskbar(&app));
    info!(
        "open_note_window_requested window_id={window_id:?} note_id={normalized_note_id:?} note_path={note_path:?} visibility={visibility:?} focus={should_focus} center_on_create={center_on_create} skip_taskbar={skip_taskbar}"
    );
    let result = (|| -> Result<window_state::CachedWindowState, String> {
        if let Some(existing) = app.get_webview_window(&window_id) {
            info!("open_note_window_reuse_existing window_id={window_id:?}");
            if let Some(bounds) = options.bounds.as_ref() {
                let width = bounds.width.round().max(1.0) as u32;
                let height = bounds.height.round().max(1.0) as u32;
                existing
                    .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                        width, height,
                    )))
                    .map_err(|error| format!("Failed to set window size: {error}"))?;
                existing
                    .set_position(PhysicalPosition::new(bounds.x, bounds.y))
                    .map_err(|error| format!("Failed to set window position: {error}"))?;
            }
            if let Some(always_on_top) = options.always_on_top {
                existing
                    .set_always_on_top(always_on_top)
                    .map_err(|error| format!("Failed to set always-on-top: {error}"))?;
            }
            existing
                .set_skip_taskbar(skip_taskbar)
                .map_err(|error| format!("Failed to set skip-taskbar: {error}"))?;
            match visibility {
                window_state::WindowVisibility::Hidden => {
                    existing
                        .hide()
                        .map_err(|error| format!("Failed to hide existing window: {error}"))?;
                }
                window_state::WindowVisibility::Visible => {
                    existing
                        .show()
                        .map_err(|error| format!("Failed to show existing window: {error}"))?;
                    if should_focus {
                        existing
                            .set_focus()
                            .map_err(|error| format!("Failed to focus existing window: {error}"))?;
                        shake_existing_window(&existing);
                    }
                }
            }
            return capture_note_window_state(
                &existing,
                &normalized_note_id,
                &note_path,
                read_only,
                opacity,
                scroll_top,
            );
        }

        let url = build_note_window_url(
            &window_id,
            Some(&normalized_note_id),
            &note_path,
            Some(opacity),
        );
        let (initial_width, initial_height) = if center_on_create {
            (NEW_NOTE_WINDOW_WIDTH, NEW_NOTE_WINDOW_HEIGHT)
        } else {
            (NOTE_WINDOW_WIDTH, NOTE_WINDOW_HEIGHT)
        };
        info!(
            "open_note_window_create_begin window_id={window_id:?} width={initial_width} height={initial_height}"
        );
        let mut builder = WebviewWindowBuilder::new(&app, &window_id, WebviewUrl::App(url.into()))
            .title(format!("Pinote - {normalized_note_id}"))
            .inner_size(initial_width, initial_height)
            .min_inner_size(NOTE_WINDOW_MIN_WIDTH, NOTE_WINDOW_MIN_HEIGHT)
            .decorations(false)
            .transparent(true)
            .resizable(true)
            .always_on_top(options.always_on_top.unwrap_or(false))
            .skip_taskbar(skip_taskbar)
            .visible(false);
        if center_on_create && options.bounds.is_none() {
            builder = builder.center();
        }
        let window = builder
            .build()
            .map_err(|error| format!("Failed to create note window: {error}"))?;
        info!("open_note_window_create_built window_id={window_id:?}");
        if let Some(bounds) = options.bounds.as_ref() {
            let width = bounds.width.round().max(1.0) as u32;
            let height = bounds.height.round().max(1.0) as u32;
            window
                .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                    width, height,
                )))
                .map_err(|error| format!("Failed to set new window size: {error}"))?;
            window
                .set_position(PhysicalPosition::new(bounds.x, bounds.y))
                .map_err(|error| format!("Failed to set new window position: {error}"))?;
        }
        if visibility == window_state::WindowVisibility::Visible {
            window
                .show()
                .map_err(|error| format!("Failed to show new window: {error}"))?;
            info!("open_note_window_show_completed window_id={window_id:?}");
            if should_focus {
                window
                    .set_focus()
                    .map_err(|error| format!("Failed to focus new window: {error}"))?;
                info!("open_note_window_focus_completed window_id={window_id:?}");
            }
        }
        capture_note_window_state(
            &window,
            &normalized_note_id,
            &note_path,
            read_only,
            opacity,
            scroll_top,
        )
    })();
    match &result {
        Ok(state) => info!(
            "open_note_window_finished window_id={:?} note_id={:?} note_path={:?} visibility={:?}",
            state.window_id, state.note_id, state.note_path, state.visibility
        ),
        Err(err) => error!(
            "open_note_window_failed window_id={window_id:?} note_id={normalized_note_id:?} note_path={note_path:?} error={err}"
        ),
    }
    result
}
