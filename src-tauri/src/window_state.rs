use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const CACHE_VERSION: u32 = 1;
const CACHE_FILE_NAME: &str = "windows.json";
const NOTE_OPACITY_MIN: f64 = 0.0;
const NOTE_OPACITY_MAX: f64 = 1.0;
const NOTE_SCROLL_TOP_MIN: f64 = 0.0;
const RESERVED_WINDOW_IDS: [&str; 1] = ["settings"];
const DEFAULT_WINDOW_WIDTH: f64 = 400.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 500.0;

#[derive(Default)]
pub struct WindowStateStore(pub Mutex<()>);

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WindowVisibility {
    Visible,
    Hidden,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedWindowState {
    pub window_id: String,
    pub note_id: String,
    pub note_path: String,
    pub visibility: WindowVisibility,
    pub always_on_top: bool,
    pub read_only: bool,
    pub opacity: f64,
    pub scroll_top: f64,
    pub bounds: WindowBounds,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStateCache {
    pub version: u32,
    pub updated_at: String,
    pub windows: HashMap<String, CachedWindowState>,
    pub window_order: Vec<String>,
    pub hidden_stack: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWindowStateOptions {
    pub push_hidden_to_top: Option<bool>,
}

fn timestamp_now() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{millis:020}")
}

fn build_empty_cache() -> WindowStateCache {
    WindowStateCache {
        version: CACHE_VERSION,
        updated_at: timestamp_now(),
        windows: HashMap::new(),
        window_order: Vec::new(),
        hidden_stack: Vec::new(),
    }
}

fn as_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_default()
}

fn as_number(value: Option<&Value>, fallback: f64) -> f64 {
    value.and_then(Value::as_f64).unwrap_or(fallback)
}

fn as_i32(value: Option<&Value>, fallback: i32) -> i32 {
    value
        .and_then(Value::as_i64)
        .and_then(|number| i32::try_from(number).ok())
        .unwrap_or(fallback)
}

fn as_bool(value: Option<&Value>, fallback: bool) -> bool {
    value.and_then(Value::as_bool).unwrap_or(fallback)
}

fn compare_updated_at(left: &str, right: &str) -> std::cmp::Ordering {
    match (left.parse::<u128>(), right.parse::<u128>()) {
        (Ok(left_value), Ok(right_value)) => left_value.cmp(&right_value),
        _ => left.cmp(right),
    }
}

fn normalize_note_path(value: &str) -> String {
    value.trim().to_lowercase()
}

fn hash_fnv1a_utf16(value: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for code_unit in value.encode_utf16() {
        hash ^= code_unit as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{hash:08x}")
}

fn build_note_cache_key(note_path: &str) -> String {
    hash_fnv1a_utf16(&normalize_note_path(note_path))
}

fn sanitize_bounds(value: Option<&Value>) -> WindowBounds {
    let Some(source) = value.and_then(Value::as_object) else {
        return WindowBounds {
            x: 0,
            y: 0,
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
        };
    };
    WindowBounds {
        x: as_i32(source.get("x"), 0),
        y: as_i32(source.get("y"), 0),
        width: as_number(source.get("width"), DEFAULT_WINDOW_WIDTH)
            .round()
            .max(1.0),
        height: as_number(source.get("height"), DEFAULT_WINDOW_HEIGHT)
            .round()
            .max(1.0),
    }
}

fn sanitize_window_state(value: &Value) -> Option<CachedWindowState> {
    let source = value.as_object()?;
    let window_id = as_string(source.get("windowId"));
    let note_id = as_string(source.get("noteId"));
    let note_path = as_string(source.get("notePath"));
    if window_id.is_empty() || note_id.is_empty() || note_path.is_empty() {
        return None;
    }
    if RESERVED_WINDOW_IDS.contains(&window_id.as_str()) {
        return None;
    }
    let updated_at = {
        let value = as_string(source.get("updatedAt"));
        if value.is_empty() {
            timestamp_now()
        } else {
            value
        }
    };
    Some(CachedWindowState {
        window_id,
        note_id,
        note_path,
        visibility: if as_string(source.get("visibility")) == "hidden" {
            WindowVisibility::Hidden
        } else {
            WindowVisibility::Visible
        },
        always_on_top: as_bool(source.get("alwaysOnTop"), false),
        read_only: as_bool(source.get("readOnly"), false),
        opacity: as_number(source.get("opacity"), 1.0).clamp(NOTE_OPACITY_MIN, NOTE_OPACITY_MAX),
        scroll_top: as_number(source.get("scrollTop"), 0.0).max(NOTE_SCROLL_TOP_MIN),
        bounds: sanitize_bounds(source.get("bounds")),
        updated_at,
    })
}

fn sanitize_cache(value: Value) -> WindowStateCache {
    let Some(source) = value.as_object() else {
        return build_empty_cache();
    };
    let version = source
        .get("version")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or_default();
    if version != CACHE_VERSION {
        return build_empty_cache();
    }

    let mut windows: HashMap<String, CachedWindowState> = HashMap::new();
    if let Some(windows_source) = source.get("windows").and_then(Value::as_object) {
        for item in windows_source.values() {
            let Some(parsed) = sanitize_window_state(item) else {
                continue;
            };
            let cache_key = build_note_cache_key(&parsed.note_path);
            match windows.get(&cache_key) {
                Some(previous)
                    if compare_updated_at(&parsed.updated_at, &previous.updated_at)
                        == std::cmp::Ordering::Less => {}
                _ => {
                    windows.insert(cache_key, parsed);
                }
            }
        }
    }

    let existing_ids = windows.keys().cloned().collect::<HashSet<_>>();

    let mut window_order = Vec::new();
    let mut seen_order: HashSet<String> = HashSet::new();
    if let Some(order_source) = source.get("windowOrder").and_then(Value::as_array) {
        for item in order_source {
            let key = item
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_default();
            if key.is_empty() || !existing_ids.contains(&key) || !seen_order.insert(key.clone()) {
                continue;
            }
            window_order.push(key);
        }
    }
    for key in &existing_ids {
        if seen_order.contains(key) {
            continue;
        }
        window_order.push(key.clone());
    }

    let mut hidden_stack = Vec::new();
    if let Some(hidden_source) = source.get("hiddenStack").and_then(Value::as_array) {
        for item in hidden_source {
            let key = item
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_default();
            if key.is_empty() || !existing_ids.contains(&key) {
                continue;
            }
            let Some(state) = windows.get(&key) else {
                continue;
            };
            if state.visibility != WindowVisibility::Hidden {
                continue;
            }
            hidden_stack.push(key);
        }
    }

    let updated_at = {
        let value = as_string(source.get("updatedAt"));
        if value.is_empty() {
            timestamp_now()
        } else {
            value
        }
    };

    WindowStateCache {
        version: CACHE_VERSION,
        updated_at,
        windows,
        window_order,
        hidden_stack,
    }
}

fn cache_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir.join(CACHE_FILE_NAME))
}

fn read_cache_unlocked(app: &tauri::AppHandle) -> Result<WindowStateCache, String> {
    let cache_file = cache_file_path(app)?;
    let content = match fs::read_to_string(cache_file) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(build_empty_cache());
        }
        Err(error) => return Err(format!("Failed to read window state cache: {error}")),
    };
    let value = match serde_json::from_str::<Value>(&content) {
        Ok(value) => value,
        Err(_) => return Ok(build_empty_cache()),
    };
    Ok(sanitize_cache(value))
}

fn write_cache_unlocked(app: &tauri::AppHandle, cache: &WindowStateCache) -> Result<(), String> {
    let cache_file = cache_file_path(app)?;
    let content = serde_json::to_string_pretty(cache)
        .map_err(|error| format!("Failed to serialize window state cache: {error}"))?;
    fs::write(cache_file, content)
        .map_err(|error| format!("Failed to write window state cache: {error}"))
}

fn read_cache(app: &tauri::AppHandle) -> Result<WindowStateCache, String> {
    let state = app.state::<WindowStateStore>();
    let _guard = state
        .0
        .lock()
        .map_err(|_| String::from("Failed to lock window state cache"))?;
    read_cache_unlocked(app)
}

fn mutate_cache<T>(
    app: &tauri::AppHandle,
    updater: impl FnOnce(&mut WindowStateCache) -> T,
) -> Result<T, String> {
    let state = app.state::<WindowStateStore>();
    let _guard = state
        .0
        .lock()
        .map_err(|_| String::from("Failed to lock window state cache"))?;
    let mut cache = read_cache_unlocked(app)?;
    let value = updater(&mut cache);
    write_cache_unlocked(app, &cache)?;
    Ok(value)
}

fn resolve_cache_key_by_window_id(cache: &WindowStateCache, window_id: &str) -> Option<String> {
    let target = window_id.trim();
    if target.is_empty() {
        return None;
    }
    if cache.windows.contains_key(target) {
        return Some(target.to_string());
    }
    cache.windows.iter().find_map(|(cache_key, state)| {
        if state.window_id == target {
            Some(cache_key.clone())
        } else {
            None
        }
    })
}

fn set_window_order(cache: &mut WindowStateCache, cache_key: &str) {
    if cache.window_order.iter().any(|item| item == cache_key) {
        return;
    }
    cache.window_order.push(cache_key.to_string());
}

fn set_hidden_stack(cache: &mut WindowStateCache, cache_key: &str, push_hidden_to_top: bool) {
    let already_hidden = cache.hidden_stack.iter().any(|item| item == cache_key);
    if already_hidden && !push_hidden_to_top {
        return;
    }
    cache.hidden_stack.retain(|item| item != cache_key);
    cache.hidden_stack.push(cache_key.to_string());
}

fn clear_hidden_stack(cache: &mut WindowStateCache, cache_key: &str) {
    cache.hidden_stack.retain(|item| item != cache_key);
}

pub fn load_window_state_cache(app: &tauri::AppHandle) -> Result<WindowStateCache, String> {
    read_cache(app)
}

pub fn load_windows_for_startup(app: &tauri::AppHandle) -> Result<Vec<CachedWindowState>, String> {
    let cache = read_cache(app)?;
    let mut ordered = Vec::new();
    for cache_key in &cache.window_order {
        let Some(state) = cache.windows.get(cache_key) else {
            continue;
        };
        ordered.push(state.clone());
    }
    Ok(ordered)
}

pub fn get_window_state(
    app: &tauri::AppHandle,
    window_id: &str,
) -> Result<Option<CachedWindowState>, String> {
    let cache = read_cache(app)?;
    let Some(cache_key) = resolve_cache_key_by_window_id(&cache, window_id) else {
        return Ok(None);
    };
    Ok(cache.windows.get(&cache_key).cloned())
}

pub fn get_window_state_by_note_path(
    app: &tauri::AppHandle,
    note_path: &str,
) -> Result<Option<CachedWindowState>, String> {
    let cache = read_cache(app)?;
    Ok(cache.windows.get(&build_note_cache_key(note_path)).cloned())
}

pub fn get_most_recent_hidden_window_state(
    app: &tauri::AppHandle,
) -> Result<Option<CachedWindowState>, String> {
    let cache = read_cache(app)?;
    for cache_key in cache.hidden_stack.iter().rev() {
        let Some(state) = cache.windows.get(cache_key) else {
            continue;
        };
        if state.visibility != WindowVisibility::Hidden {
            continue;
        }
        return Ok(Some(state.clone()));
    }
    Ok(None)
}

pub fn list_window_states_in_order(
    app: &tauri::AppHandle,
) -> Result<Vec<CachedWindowState>, String> {
    load_windows_for_startup(app)
}

pub fn list_hidden_window_ids(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let cache = read_cache(app)?;
    let mut labels = Vec::new();
    let mut seen = HashSet::new();
    for cache_key in &cache.hidden_stack {
        let Some(state) = cache.windows.get(cache_key) else {
            continue;
        };
        if state.visibility != WindowVisibility::Hidden {
            continue;
        }
        if !seen.insert(state.window_id.clone()) {
            continue;
        }
        labels.push(state.window_id.clone());
    }
    for state in cache.windows.values() {
        if state.visibility != WindowVisibility::Hidden {
            continue;
        }
        if !seen.insert(state.window_id.clone()) {
            continue;
        }
        labels.push(state.window_id.clone());
    }
    Ok(labels)
}

pub fn upsert_window_state(
    app: &tauri::AppHandle,
    state: CachedWindowState,
    options: UpdateWindowStateOptions,
) -> Result<(), String> {
    mutate_cache(app, |cache| {
        let now = timestamp_now();
        let next_state = CachedWindowState {
            updated_at: if state.updated_at.trim().is_empty() {
                now.clone()
            } else {
                state.updated_at.trim().to_string()
            },
            opacity: state.opacity.clamp(NOTE_OPACITY_MIN, NOTE_OPACITY_MAX),
            scroll_top: state.scroll_top.max(NOTE_SCROLL_TOP_MIN),
            bounds: WindowBounds {
                x: state.bounds.x,
                y: state.bounds.y,
                width: state.bounds.width.round().max(1.0),
                height: state.bounds.height.round().max(1.0),
            },
            window_id: state.window_id.trim().to_string(),
            note_id: state.note_id.trim().to_string(),
            note_path: state.note_path.trim().to_string(),
            visibility: state.visibility,
            always_on_top: state.always_on_top,
            read_only: state.read_only,
        };
        if next_state.window_id.is_empty()
            || next_state.note_id.is_empty()
            || next_state.note_path.is_empty()
            || RESERVED_WINDOW_IDS.contains(&next_state.window_id.as_str())
        {
            return;
        }
        let cache_key = build_note_cache_key(&next_state.note_path);
        cache.windows.insert(cache_key.clone(), next_state.clone());
        set_window_order(cache, &cache_key);
        if next_state.visibility == WindowVisibility::Hidden {
            set_hidden_stack(
                cache,
                &cache_key,
                options.push_hidden_to_top.unwrap_or(false),
            );
        } else {
            clear_hidden_stack(cache, &cache_key);
        }
        cache.updated_at = now;
    })
}

pub fn set_window_visibility(
    app: &tauri::AppHandle,
    window_id: &str,
    visibility: WindowVisibility,
    options: UpdateWindowStateOptions,
) -> Result<(), String> {
    mutate_cache(app, |cache| {
        let Some(cache_key) = resolve_cache_key_by_window_id(cache, window_id) else {
            return;
        };
        let now = timestamp_now();
        {
            let Some(state) = cache.windows.get_mut(&cache_key) else {
                return;
            };
            state.visibility = visibility;
            state.updated_at = now.clone();
        }
        if visibility == WindowVisibility::Hidden {
            set_hidden_stack(
                cache,
                &cache_key,
                options.push_hidden_to_top.unwrap_or(false),
            );
        } else {
            clear_hidden_stack(cache, &cache_key);
        }
        cache.updated_at = now;
    })
}

pub fn set_window_visibility_by_labels(
    app: &tauri::AppHandle,
    window_labels: &[String],
    visibility: WindowVisibility,
    options: UpdateWindowStateOptions,
) -> Result<(), String> {
    if window_labels.is_empty() {
        return Ok(());
    }
    mutate_cache(app, |cache| {
        let now = timestamp_now();
        for window_label in window_labels {
            let Some(cache_key) = resolve_cache_key_by_window_id(cache, window_label) else {
                continue;
            };
            {
                let Some(state) = cache.windows.get_mut(&cache_key) else {
                    continue;
                };
                state.visibility = visibility;
                state.updated_at = now.clone();
            }
            if visibility == WindowVisibility::Hidden {
                set_hidden_stack(
                    cache,
                    &cache_key,
                    options.push_hidden_to_top.unwrap_or(false),
                );
            } else {
                clear_hidden_stack(cache, &cache_key);
            }
        }
        cache.updated_at = now;
    })
}

pub fn remove_window_state(app: &tauri::AppHandle, window_id: &str) -> Result<(), String> {
    mutate_cache(app, |cache| {
        let Some(cache_key) = resolve_cache_key_by_window_id(cache, window_id) else {
            return;
        };
        let now = timestamp_now();
        cache.windows.remove(&cache_key);
        cache.window_order.retain(|item| item != &cache_key);
        cache.hidden_stack.retain(|item| item != &cache_key);
        cache.updated_at = now;
    })
}
