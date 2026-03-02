mod shortcut;
mod tray;
mod window;

use log::{LevelFilter, error, info};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path, path::PathBuf, sync::Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::{Target, TargetKind};
#[cfg(target_os = "windows")]
use winreg::{
    RegKey,
    enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE},
};

const NOTE_WINDOW_PREFIX: &str = "note-";
const NOTE_WINDOW_WIDTH: f64 = 400.0;
const NOTE_WINDOW_HEIGHT: f64 = 500.0;
const NOTE_WINDOW_MIN_WIDTH: f64 = 1.0;
const NOTE_WINDOW_MIN_HEIGHT: f64 = 1.0;
const SETTINGS_FILE_NAME: &str = "settings.json";
const DEFAULT_HIDE_NOTE_WINDOWS_FROM_TASKBAR: bool = true;
#[cfg(target_os = "windows")]
const OPEN_WITH_PINOTE_MENU_KEY: &str = "OpenWithPinote";
#[cfg(target_os = "windows")]
const OPEN_WITH_PINOTE_MENU_TITLE: &str = "Use Pinote to Open";
#[cfg(target_os = "windows")]
const OPEN_WITH_PINOTE_EXTENSIONS: [&str; 2] = [".md", ".markdown"];
#[cfg(target_os = "windows")]
const PINOTE_MARKDOWN_PROG_ID: &str = "Pinote.Markdown";
#[cfg(target_os = "windows")]
const PINOTE_MARKDOWN_FILE_TYPE: &str = "Pinote Markdown File";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CliOpenNoteRequest {
    note_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    hide_note_windows_from_taskbar: Option<bool>,
}

#[derive(Default)]
struct PendingCliOpenNotes(Mutex<Vec<CliOpenNoteRequest>>);

fn is_markdown_file_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn resolve_cli_note_path(raw_path: &str, cwd: Option<&Path>) -> Option<String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('-') {
        return None;
    }
    let path = PathBuf::from(trimmed);
    if !is_markdown_file_path(&path) {
        return None;
    }
    let resolved = if path.is_absolute() {
        path
    } else if let Some(base) = cwd {
        base.join(path)
    } else {
        path
    };
    let normalized = match resolved.canonicalize() {
        Ok(path) => path,
        Err(_) => resolved,
    };
    Some(normalized.to_string_lossy().into_owned())
}

fn parse_cli_open_note_requests(argv: &[String], cwd: Option<&str>) -> Vec<CliOpenNoteRequest> {
    let cwd_path = cwd.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(PathBuf::from(trimmed))
        }
    });
    let mut seen = HashSet::new();
    let mut requests = Vec::new();
    for arg in argv {
        let Some(note_path) = resolve_cli_note_path(arg, cwd_path.as_deref()) else {
            continue;
        };
        let dedupe_key = note_path.to_lowercase();
        if !seen.insert(dedupe_key) {
            continue;
        }
        requests.push(CliOpenNoteRequest { note_path });
    }
    requests
}

fn hash_fnv1a_utf16(value: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for code_unit in value.encode_utf16() {
        hash ^= code_unit as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{hash:08x}")
}

fn build_note_window_id(note_path: &str) -> String {
    let normalized = note_path.trim().to_lowercase();
    format!("{NOTE_WINDOW_PREFIX}{}", hash_fnv1a_utf16(&normalized))
}

fn encode_query_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        let is_unreserved =
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if is_unreserved {
            encoded.push(char::from(byte));
            continue;
        }
        encoded.push('%');
        encoded.push_str(&format!("{byte:02X}"));
    }
    encoded
}

fn build_note_window_url(window_id: &str, note_path: &str) -> String {
    let encoded_window_id = encode_query_component(window_id);
    let encoded_note_path = encode_query_component(note_path);
    format!("index.html?view=note&windowId={encoded_window_id}&notePath={encoded_note_path}")
}

fn load_hide_note_windows_from_taskbar(app: &tauri::AppHandle) -> bool {
    let path = match app.path().app_data_dir() {
        Ok(dir) => dir.join(SETTINGS_FILE_NAME),
        Err(_) => return DEFAULT_HIDE_NOTE_WINDOWS_FROM_TASKBAR,
    };
    let content = match std::fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return DEFAULT_HIDE_NOTE_WINDOWS_FROM_TASKBAR,
    };
    let settings: StoredSettings = match serde_json::from_str(&content) {
        Ok(value) => value,
        Err(_) => return DEFAULT_HIDE_NOTE_WINDOWS_FROM_TASKBAR,
    };
    settings
        .hide_note_windows_from_taskbar
        .unwrap_or(DEFAULT_HIDE_NOTE_WINDOWS_FROM_TASKBAR)
}

fn open_cli_note_windows_on_main_thread(app: &tauri::AppHandle, requests: &[CliOpenNoteRequest]) {
    if requests.is_empty() {
        return;
    }
    let skip_taskbar = load_hide_note_windows_from_taskbar(app);
    let last_index = requests.len() - 1;
    for (index, request) in requests.iter().enumerate() {
        let note_path = request.note_path.trim();
        if note_path.is_empty() {
            continue;
        }
        let should_focus = index == last_index;
        let window_id = build_note_window_id(note_path);
        if let Some(existing) = app.get_webview_window(&window_id) {
            if let Err(err) = existing.show() {
                error!("cli_open_existing_window_show_failed window_id={window_id:?} error={err}");
                continue;
            }
            if let Err(err) = existing.set_skip_taskbar(skip_taskbar) {
                error!(
                    "cli_open_existing_window_skip_taskbar_failed window_id={window_id:?} error={err}"
                );
            }
            if should_focus && let Err(err) = existing.set_focus() {
                error!("cli_open_existing_window_focus_failed window_id={window_id:?} error={err}");
            }
            continue;
        }
        let url = build_note_window_url(&window_id, note_path);
        let window = match WebviewWindowBuilder::new(app, &window_id, WebviewUrl::App(url.into()))
            .title("Pinote")
            .inner_size(NOTE_WINDOW_WIDTH, NOTE_WINDOW_HEIGHT)
            .min_inner_size(NOTE_WINDOW_MIN_WIDTH, NOTE_WINDOW_MIN_HEIGHT)
            .decorations(false)
            .transparent(true)
            .resizable(true)
            .always_on_top(false)
            .skip_taskbar(skip_taskbar)
            .visible(true)
            .build()
        {
            Ok(window) => window,
            Err(err) => {
                error!("cli_open_new_window_failed window_id={window_id:?} error={err}");
                continue;
            }
        };
        if should_focus && let Err(err) = window.set_focus() {
            error!("cli_open_new_window_focus_failed window_id={window_id:?} error={err}");
        }
    }
}

fn open_cli_note_windows(app: &tauri::AppHandle, requests: Vec<CliOpenNoteRequest>) {
    if requests.is_empty() {
        return;
    }
    let handle = app.clone();
    if let Err(err) = app.run_on_main_thread(move || {
        open_cli_note_windows_on_main_thread(&handle, &requests);
    }) {
        error!("cli_dispatch_main_thread_failed error={err}");
    }
}

#[cfg(target_os = "windows")]
fn open_with_pinote_shell_key_path(extension: &str) -> String {
    format!(
        r"Software\Classes\SystemFileAssociations\{extension}\shell\{OPEN_WITH_PINOTE_MENU_KEY}"
    )
}

#[cfg(target_os = "windows")]
fn open_with_pinote_command(executable_path: &Path) -> String {
    let executable = executable_path.to_string_lossy().replace('"', "\\\"");
    format!("\"{executable}\" \"%1\"")
}

#[cfg(target_os = "windows")]
fn open_with_pinote_icon(executable_path: &Path) -> String {
    let executable = executable_path.to_string_lossy().replace('"', "\\\"");
    format!("\"{executable}\",0")
}

#[cfg(target_os = "windows")]
fn is_open_with_pinote_enabled() -> bool {
    let classes = RegKey::predef(HKEY_CURRENT_USER);
    OPEN_WITH_PINOTE_EXTENSIONS.iter().all(|extension| {
        let path = open_with_pinote_shell_key_path(extension);
        classes.open_subkey(path).is_ok()
    })
}

#[cfg(target_os = "windows")]
fn set_open_with_pinote_enabled_windows(enabled: bool) -> Result<(), String> {
    let classes = RegKey::predef(HKEY_CURRENT_USER);
    if !enabled {
        for extension in OPEN_WITH_PINOTE_EXTENSIONS {
            let path = open_with_pinote_shell_key_path(extension);
            let _ = classes.delete_subkey_all(path);
        }
        info!("open_with_pinote_disabled");
        return Ok(());
    }

    let executable_path = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve executable path: {error}"))?;
    let command = open_with_pinote_command(&executable_path);
    let icon = open_with_pinote_icon(&executable_path);
    for extension in OPEN_WITH_PINOTE_EXTENSIONS {
        let path = open_with_pinote_shell_key_path(extension);
        let (shell_key, _) = classes
            .create_subkey(&path)
            .map_err(|error| format!("Failed to create registry key `{path}`: {error}"))?;
        shell_key
            .set_value("", &OPEN_WITH_PINOTE_MENU_TITLE)
            .map_err(|error| format!("Failed to write registry value for `{path}`: {error}"))?;
        shell_key
            .set_value("Icon", &icon)
            .map_err(|error| format!("Failed to write icon value for `{path}`: {error}"))?;
        let (command_key, _) = shell_key
            .create_subkey("command")
            .map_err(|error| format!("Failed to create command key for `{path}`: {error}"))?;
        command_key
            .set_value("", &command)
            .map_err(|error| format!("Failed to write command value for `{path}`: {error}"))?;
    }
    info!("open_with_pinote_enabled");
    Ok(())
}

#[cfg(target_os = "windows")]
fn markdown_default_extension_key_path(extension: &str) -> String {
    format!(r"Software\Classes\{extension}")
}

#[cfg(target_os = "windows")]
fn markdown_default_prog_id_key_path() -> String {
    format!(r"Software\Classes\{PINOTE_MARKDOWN_PROG_ID}")
}

#[cfg(target_os = "windows")]
fn is_default_markdown_open_enabled_windows() -> bool {
    let classes = RegKey::predef(HKEY_CURRENT_USER);
    let prog_id_path = markdown_default_prog_id_key_path();
    if classes.open_subkey(prog_id_path).is_err() {
        return false;
    }
    OPEN_WITH_PINOTE_EXTENSIONS.iter().all(|extension| {
        let key_path = markdown_default_extension_key_path(extension);
        let Ok(extension_key) = classes.open_subkey(key_path) else {
            return false;
        };
        let prog_id = extension_key.get_value::<String, _>("").unwrap_or_default();
        prog_id.eq_ignore_ascii_case(PINOTE_MARKDOWN_PROG_ID)
    })
}

#[cfg(target_os = "windows")]
fn set_default_markdown_open_enabled_windows(enabled: bool) -> Result<(), String> {
    let classes = RegKey::predef(HKEY_CURRENT_USER);
    let prog_id_path = markdown_default_prog_id_key_path();
    if !enabled {
        for extension in OPEN_WITH_PINOTE_EXTENSIONS {
            let extension_path = markdown_default_extension_key_path(extension);
            if let Ok(extension_key) =
                classes.open_subkey_with_flags(&extension_path, KEY_READ | KEY_WRITE)
            {
                let current_prog_id = extension_key.get_value::<String, _>("").unwrap_or_default();
                if current_prog_id.eq_ignore_ascii_case(PINOTE_MARKDOWN_PROG_ID) {
                    let _ = extension_key.delete_value("");
                }
                if let Ok(open_with_key) =
                    extension_key.open_subkey_with_flags("OpenWithProgids", KEY_READ | KEY_WRITE)
                {
                    let _ = open_with_key.delete_value(PINOTE_MARKDOWN_PROG_ID);
                }
            }
        }
        let _ = classes.delete_subkey_all(&prog_id_path);
        info!("default_markdown_open_disabled");
        return Ok(());
    }

    let executable_path = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve executable path: {error}"))?;
    let command = open_with_pinote_command(&executable_path);
    let icon = open_with_pinote_icon(&executable_path);

    let (prog_id_key, _) = classes
        .create_subkey(&prog_id_path)
        .map_err(|error| format!("Failed to create registry key `{prog_id_path}`: {error}"))?;
    prog_id_key
        .set_value("", &PINOTE_MARKDOWN_FILE_TYPE)
        .map_err(|error| format!("Failed to write registry value for `{prog_id_path}`: {error}"))?;
    let (icon_key, _) = prog_id_key
        .create_subkey("DefaultIcon")
        .map_err(|error| format!("Failed to create icon key for `{prog_id_path}`: {error}"))?;
    icon_key
        .set_value("", &icon)
        .map_err(|error| format!("Failed to write icon value for `{prog_id_path}`: {error}"))?;
    let (command_key, _) = prog_id_key
        .create_subkey(r"shell\open\command")
        .map_err(|error| format!("Failed to create command key for `{prog_id_path}`: {error}"))?;
    command_key
        .set_value("", &command)
        .map_err(|error| format!("Failed to write command value for `{prog_id_path}`: {error}"))?;

    for extension in OPEN_WITH_PINOTE_EXTENSIONS {
        let extension_path = markdown_default_extension_key_path(extension);
        let (extension_key, _) = classes.create_subkey(&extension_path).map_err(|error| {
            format!("Failed to create registry key `{extension_path}`: {error}")
        })?;
        extension_key
            .set_value("", &PINOTE_MARKDOWN_PROG_ID)
            .map_err(|error| {
                format!("Failed to write registry value for `{extension_path}`: {error}")
            })?;
        let (open_with_key, _) =
            extension_key
                .create_subkey("OpenWithProgids")
                .map_err(|error| {
                    format!("Failed to create OpenWithProgids for `{extension_path}`: {error}")
                })?;
        open_with_key
            .set_value(PINOTE_MARKDOWN_PROG_ID, &"")
            .map_err(|error| {
                format!("Failed to write OpenWithProgids for `{extension_path}`: {error}")
            })?;
    }
    info!("default_markdown_open_enabled");
    Ok(())
}

#[tauri::command]
fn get_open_with_pinote_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        return Ok(is_open_with_pinote_enabled());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn set_open_with_pinote_enabled(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        set_open_with_pinote_enabled_windows(enabled)?;
        return Ok(is_open_with_pinote_enabled());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Err(String::from("Only supported on Windows"))
    }
}

#[tauri::command]
fn get_default_markdown_open_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        return Ok(is_default_markdown_open_enabled_windows());
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn set_default_markdown_open_enabled(enabled: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        set_default_markdown_open_enabled_windows(enabled)?;
        return Ok(is_default_markdown_open_enabled_windows());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Err(String::from("Only supported on Windows"))
    }
}

#[tauri::command]
fn consume_cli_open_note_requests(
    state: tauri::State<'_, PendingCliOpenNotes>,
) -> Result<Vec<CliOpenNoteRequest>, String> {
    let mut pending = state
        .0
        .lock()
        .map_err(|_| String::from("Failed to access pending CLI note requests"))?;
    Ok(std::mem::take(&mut *pending))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingCliOpenNotes::default())
        .plugin({
            let level = if cfg!(debug_assertions) {
                LevelFilter::Debug
            } else {
                LevelFilter::Warn
            };
            tauri_plugin_log::Builder::new()
                .level(level)
                .targets([Target::new(TargetKind::Stdout)])
                .build()
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let requests = parse_cli_open_note_requests(&argv, Some(cwd.as_str()));
            open_cli_note_windows(app, requests);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            consume_cli_open_note_requests,
            get_open_with_pinote_enabled,
            set_open_with_pinote_enabled,
            get_default_markdown_open_enabled,
            set_default_markdown_open_enabled
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tray::setup_tray(&handle)?;
            shortcut::setup_shortcuts(&handle)?;
            let startup_args = std::env::args().collect::<Vec<_>>();
            let startup_cwd = std::env::current_dir()
                .ok()
                .map(|path| path.to_string_lossy().into_owned());
            let startup_requests =
                parse_cli_open_note_requests(&startup_args, startup_cwd.as_deref());
            open_cli_note_windows(&handle, startup_requests);

            info!("app_ready");

            let window = app.get_webview_window("main").unwrap();
            let _ = window.center();

            #[cfg(target_os = "macos")]
            window_vibrancy::apply_vibrancy(
                &window,
                window_vibrancy::NSVisualEffectMaterial::HudWindow,
                None,
                None,
            )
            .ok();

            #[cfg(target_os = "windows")]
            window_vibrancy::apply_acrylic(&window, Some((0, 0, 0, 0))).ok();

            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(win) = handle.get_webview_window("main") {
                        info!("main_window_hide");
                        let _ = win.hide();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
