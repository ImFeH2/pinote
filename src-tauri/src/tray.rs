use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::{
    locale, open_new_note_window,
    window::{restore_hidden_window, restore_latest_hidden_window, show_settings_window},
};

struct TrayMenuItems {
    show_hide: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

pub fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let text = locale::current_text(app);
    let show_hide = MenuItem::with_id(app, "show_hide", text.restore_hidden, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", text.open_settings, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", text.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_hide, &settings, &quit])?;

    app.manage(TrayMenuItems {
        show_hide,
        settings,
        quit,
    });

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_hide" => {
                restore_hidden_window(app);
            }
            "settings" => {
                let handle = app.clone();
                std::thread::spawn(move || {
                    let _ = show_settings_window(&handle, None);
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if !restore_latest_hidden_window(app) {
                    open_new_note_window(app);
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn sync_locale(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    let Some(items) = app.try_state::<TrayMenuItems>() else {
        return Ok(());
    };
    let text = locale::current_text(app);
    items.show_hide.set_text(text.restore_hidden)?;
    items.settings.set_text(text.open_settings)?;
    items.quit.set_text(text.quit)?;
    Ok(())
}
