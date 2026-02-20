use serde::Deserialize;
use std::str::FromStr;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::window::toggle_window_visibility;

const DEFAULT_TOGGLE_WINDOW_SHORTCUT: &str = "Alt+N";
const SETTINGS_FILE_NAME: &str = "settings.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    shortcuts: Option<StoredShortcuts>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredShortcuts {
    toggle_window: Option<String>,
}

pub fn setup_shortcuts(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = load_toggle_window_shortcut(app)
        .unwrap_or_else(|| DEFAULT_TOGGLE_WINDOW_SHORTCUT.to_string());
    update_toggle_window_shortcut(app, &shortcut).map_err(std::io::Error::other)?;
    Ok(())
}

pub fn update_toggle_window_shortcut(
    app: &tauri::AppHandle,
    shortcut_text: &str,
) -> Result<(), String> {
    let shortcut = Shortcut::from_str(shortcut_text)
        .map_err(|error| format!("invalid shortcut `{shortcut_text}`: {error}"))?;

    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|error| format!("failed to clear global shortcuts: {error}"))?;

    manager
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            toggle_window_visibility(app);
        })
        .map_err(|error| {
            format!("failed to register global shortcut `{shortcut_text}`: {error}")
        })?;

    Ok(())
}

fn load_toggle_window_shortcut(app: &tauri::AppHandle) -> Option<String> {
    let path = app.path().app_data_dir().ok()?.join(SETTINGS_FILE_NAME);
    let content = std::fs::read_to_string(path).ok()?;
    let settings: StoredSettings = serde_json::from_str(&content).ok()?;
    settings.shortcuts?.toggle_window
}
