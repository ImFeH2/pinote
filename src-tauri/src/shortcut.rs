use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::window::toggle_window_visibility;

pub fn setup_shortcuts(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyN);

    app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, _event| {
        toggle_window_visibility(app);
    })?;

    Ok(())
}
