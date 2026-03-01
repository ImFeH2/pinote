mod shortcut;
mod tray;
mod window;

use log::{LevelFilter, error, info};
use serde::Serialize;
use std::{collections::HashSet, path::Path, path::PathBuf, sync::Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::{Target, TargetKind};

const NOTE_WINDOW_PREFIX: &str = "note-";
const NOTE_WINDOW_WIDTH: f64 = 400.0;
const NOTE_WINDOW_HEIGHT: f64 = 500.0;
const NOTE_WINDOW_MIN_WIDTH: f64 = 1.0;
const NOTE_WINDOW_MIN_HEIGHT: f64 = 1.0;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CliOpenNoteRequest {
    note_path: String,
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

fn open_cli_note_windows_on_main_thread(app: &tauri::AppHandle, requests: &[CliOpenNoteRequest]) {
    if requests.is_empty() {
        return;
    }
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
        .invoke_handler(tauri::generate_handler![consume_cli_open_note_requests])
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
