mod shortcut;
mod tray;
mod window;

use log::{LevelFilter, error, info};
use serde::Serialize;
use std::{collections::HashSet, path::Path, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_log::{Target, TargetKind};

const CLI_OPEN_NOTE_REQUESTED_EVENT: &str = "cli-open-note-requested";

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
    if trimmed.is_empty() || trimmed.starts_with('-') {
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
    for arg in argv.iter().skip(1) {
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

fn enqueue_cli_open_note_requests(app: &tauri::AppHandle, requests: Vec<CliOpenNoteRequest>) {
    if requests.is_empty() {
        return;
    }
    match app.state::<PendingCliOpenNotes>().0.lock() {
        Ok(mut pending) => {
            pending.extend(requests);
        }
        Err(_) => {
            error!("failed_to_acquire_cli_request_queue");
            return;
        }
    }
    if let Err(err) = app.emit(CLI_OPEN_NOTE_REQUESTED_EVENT, ()) {
        error!("failed_to_emit_cli_request_event: {err}");
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let requests = parse_cli_open_note_requests(&argv, Some(cwd.as_str()));
            enqueue_cli_open_note_requests(app, requests);
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
            enqueue_cli_open_note_requests(&handle, startup_requests);

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
