use serde::Deserialize;
use std::str::FromStr;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::window::{restore_hidden_window, toggle_visible_note_windows};

const DEFAULT_RESTORE_WINDOW_SHORTCUT: &str = "Alt+N";
const DEFAULT_TOGGLE_VISIBLE_WINDOWS_SHORTCUT: &str = "Alt+Shift+N";
const SETTINGS_FILE_NAME: &str = "settings.json";

struct LoadedShortcuts {
    restore_window: String,
    toggle_visible_windows: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    shortcuts: Option<StoredShortcuts>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredShortcuts {
    restore_window: Option<String>,
    toggle_window: Option<String>,
    toggle_visible_windows: Option<String>,
}

pub fn setup_shortcuts(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcuts = load_shortcuts(app);
    register_shortcuts(
        app,
        &shortcuts.restore_window,
        &shortcuts.toggle_visible_windows,
    )
    .map_err(std::io::Error::other)?;
    Ok(())
}

fn register_shortcuts(
    app: &tauri::AppHandle,
    restore_window_shortcut_text: &str,
    toggle_visible_windows_shortcut_text: &str,
) -> Result<(), String> {
    let restore_window_shortcut = Shortcut::from_str(restore_window_shortcut_text)
        .map_err(|error| format!("invalid shortcut `{restore_window_shortcut_text}`: {error}"))?;
    let toggle_visible_windows_shortcut = Shortcut::from_str(toggle_visible_windows_shortcut_text)
        .map_err(|error| {
            format!("invalid shortcut `{toggle_visible_windows_shortcut_text}`: {error}")
        })?;

    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|error| format!("failed to clear global shortcuts: {error}"))?;

    manager
        .on_shortcut(restore_window_shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            restore_hidden_window(app);
        })
        .map_err(|error| {
            format!("failed to register global shortcut `{restore_window_shortcut_text}`: {error}")
        })?;

    manager
        .on_shortcut(toggle_visible_windows_shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            toggle_visible_note_windows(app);
        })
        .map_err(|error| {
            format!(
                "failed to register global shortcut `{toggle_visible_windows_shortcut_text}`: {error}"
            )
        })?;

    Ok(())
}

fn load_shortcuts(app: &tauri::AppHandle) -> LoadedShortcuts {
    let path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(SETTINGS_FILE_NAME));
    let content = path.and_then(|file_path| std::fs::read_to_string(file_path).ok());
    let settings = content.and_then(|raw| serde_json::from_str::<StoredSettings>(&raw).ok());
    let shortcuts = settings.and_then(|stored| stored.shortcuts);
    LoadedShortcuts {
        restore_window: shortcuts
            .as_ref()
            .and_then(|stored| {
                stored
                    .restore_window
                    .clone()
                    .or(stored.toggle_window.clone())
            })
            .unwrap_or_else(|| DEFAULT_RESTORE_WINDOW_SHORTCUT.to_string()),
        toggle_visible_windows: shortcuts
            .and_then(|stored| stored.toggle_visible_windows)
            .unwrap_or_else(|| DEFAULT_TOGGLE_VISIBLE_WINDOWS_SHORTCUT.to_string()),
    }
}
