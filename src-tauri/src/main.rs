use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration as StdDuration,
};
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Position, WebviewUrl,
    WebviewWindowBuilder,
};

// macOS-only: flip the pet window's NSWindow collection behavior so it
// floats above other apps' fullscreen Spaces and joins all virtual
// desktops. Tauri's `set_visible_on_all_workspaces` only sets
// `CanJoinAllSpaces`, which is enough for normal Spaces but not for
// fullscreen apps — those live in their own dedicated Space and clip
// any window that doesn't carry `FullScreenAuxiliary`. We OR both bits
// (plus `Stationary` so the window doesn't slide with Spaces) onto
// whatever Tauri already set, instead of overwriting, so we don't
// accidentally clear flags Tauri depends on.
//
// This is a no-op on non-macOS targets.
#[cfg(target_os = "macos")]
fn with_pet_ns_window(window: &tauri::WebviewWindow, apply: impl FnOnce(&objc2_app_kit::NSWindow)) {
    use objc2_app_kit::NSWindow;

    let ns_window_ptr = match window.ns_window() {
        Ok(handle) => handle,
        Err(error) => {
            eprintln!(
                "[pet-window] failed to acquire NSWindow handle for overlay behavior: {error}"
            );
            return;
        }
    };
    if ns_window_ptr.is_null() {
        return;
    }

    let Some(ns_window) = (unsafe { ns_window_ptr.cast::<NSWindow>().as_ref() }) else {
        return;
    };

    apply(ns_window);
}

#[cfg(target_os = "macos")]
fn apply_pet_window_macos_overlay_behavior(window: &tauri::WebviewWindow) {
    use objc2_app_kit::NSWindowCollectionBehavior;

    with_pet_ns_window(window, |ns_window| {
        let current = ns_window.collectionBehavior();
        let extra = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary;
        ns_window.setCollectionBehavior(current | extra);
    });
}

#[cfg(not(target_os = "macos"))]
fn apply_pet_window_macos_overlay_behavior(_window: &tauri::WebviewWindow) {}

#[cfg(target_os = "macos")]
fn order_pet_window_front(window: &tauri::WebviewWindow) {
    with_pet_ns_window(window, |ns_window| {
        ns_window.orderFrontRegardless();
    });
}

#[cfg(not(target_os = "macos"))]
fn order_pet_window_front(_window: &tauri::WebviewWindow) {}

#[cfg(target_os = "macos")]
fn frontmost_window_center_position() -> Option<(f64, f64)> {
    let script = r#"
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  try
    set w to front window of frontApp
    set p to position of w
    set s to size of w
    return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & (item 2 of s as text)
  on error
    return ""
  end try
end tell
"#;
    let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let values = text
        .trim()
        .split(',')
        .map(|part| part.trim().parse::<f64>().ok())
        .collect::<Option<Vec<_>>>()?;
    if values.len() != 4 || values[2] <= 0.0 || values[3] <= 0.0 {
        return None;
    }
    Some((values[0] + values[2] / 2.0, values[1] + values[3] / 2.0))
}

#[cfg(not(target_os = "macos"))]
fn frontmost_window_center_position() -> Option<(f64, f64)> {
    None
}

const PANEL_WIDTH: f64 = 440.0;
const PANEL_HEIGHT: f64 = 760.0;
const PET_HIT_SIZE: f64 = 272.0;
const WALK_STEP_X: f64 = 12.0;
const WALK_TICK_MS: u64 = 200;
const WALK_INTERRUPT_SECONDS: i64 = 5;
const CODING_PRESENTATION_HOLD_SECONDS: i64 = 24;
const CODING_EVENT_BRIDGE_PORT: u16 = 44557;
const SCREEN_AWARENESS_MAX_CHARS: usize = 6000;
const USER_PET_IMAGE_MAX_BYTES: u64 = 4 * 1024 * 1024;
const USER_PET_MAX_PARTS_PER_STAGE: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScreenAwarenessResult {
    supported: bool,
    platform: String,
    text: String,
    line_count: usize,
    screenshot_path: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowPosition {
    x: i32,
    y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetHitRegion {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetWindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetWindowTeleported {
    x: i32,
    y: i32,
    reason: String,
    title: Option<String>,
    summary: Option<String>,
    display_text: Option<String>,
    source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WalkTick {
    x: f64,
    y: f64,
    action: String,
    facing: String,
    frame: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReminderItem {
    id: String,
    title: String,
    scheduled_at: String,
    created_at: String,
    status: String,
    snooze_until: Option<String>,
    intensity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReminderInput {
    title: String,
    scheduled_at: String,
    intensity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetStateSnapshot {
    stage: String,
    age_days: i64,
    hunger: f64,
    mood: f64,
    cleanliness: f64,
    health: f64,
    energy: f64,
    affection: f64,
    loneliness: f64,
    is_sleeping: bool,
    last_interaction_at: String,
    last_care_at: Option<String>,
    hatched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PetEnvelope {
    state: PetStateSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelConfig {
    enabled: bool,
    provider: String,
    endpoint: String,
    model: String,
    timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelServiceEnsureResult {
    already_running: bool,
    attempted_start: bool,
    connected: bool,
    launch_method: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEventWriteInput {
    provider: String,
    title: String,
    starts_at: String,
    ends_at: Option<String>,
    notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEventWriteResult {
    provider: String,
    target: String,
    event_id: Option<String>,
    file_path: Option<String>,
    fallback: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodingEvent {
    id: String,
    kind: String,
    source: String,
    title: String,
    summary: Option<String>,
    status: String,
    created_at: String,
    metadata: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodingEventIngestResult {
    accepted: bool,
    event: CodingEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetCutoutPlacementPayload {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    slot_id: Option<String>,
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    z_index: i64,
    visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetCutoutPartPayload {
    id: String,
    slot_id: String,
    label: String,
    image_src: String,
    motion_role: String,
    default_placement: PetCutoutPlacementPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedPetPackageStagePayload {
    renderer: String,
    parts: Vec<PetCutoutPartPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedPetPackagePayload {
    species_id: String,
    manifest_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    label_en: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    license: Option<String>,
    stages: HashMap<String, ImportedPetPackageStagePayload>,
}

#[derive(Debug, Deserialize)]
struct UserPetManifest {
    format: String,
    id: String,
    version: Option<String>,
    name: Value,
    author: Option<String>,
    license: Option<String>,
    stages: HashMap<String, UserPetManifestStage>,
}

#[derive(Debug, Deserialize)]
struct UserPetManifestStage {
    renderer: String,
    parts: Vec<UserPetManifestPart>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserPetManifestPart {
    id: String,
    slot_id: Option<String>,
    label: Option<String>,
    image: String,
    motion_role: Option<String>,
    default_placement: PetCutoutPlacementPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateUserPetFromImageInput {
    name: String,
    file_name: String,
    image_base64: String,
}

#[derive(Debug, Clone)]
struct WalkState {
    x: f64,
    direction: f64,
    frame: u64,
    interrupted_until: Option<DateTime<Utc>>,
}

impl Default for WalkState {
    fn default() -> Self {
        Self {
            x: 72.0,
            direction: 1.0,
            frame: 0,
            interrupted_until: None,
        }
    }
}

#[derive(Default)]
struct AppState {
    panel_open: Mutex<bool>,
    reminder_scheduler_started: Mutex<bool>,
    walk_scheduler_started: Mutex<bool>,
    coding_event_bridge_started: Mutex<bool>,
    pet_hit_region: Mutex<Option<PetHitRegion>>,
    walk_state: Mutex<WalkState>,
    recent_coding_event_ids: Mutex<HashSet<String>>,
    // Activity sampler bookkeeping. The "enabled" flag is wrapped in an Arc
    // so the spawned sampler thread can hold its own reference without
    // taking the whole AppState along.
    activity_sampler_started: Mutex<bool>,
    activity_sampler_enabled: ArcMutexBool,
}

// Tiny wrapper so the field still gets `Default::default()` for free while
// remaining cheap to clone into a worker thread.
#[derive(Clone)]
struct ArcMutexBool(Arc<Mutex<bool>>);

impl Default for ArcMutexBool {
    fn default() -> Self {
        ArcMutexBool(Arc::new(Mutex::new(false)))
    }
}

impl ArcMutexBool {
    fn lock(&self) -> std::sync::LockResult<std::sync::MutexGuard<'_, bool>> {
        self.0.lock()
    }

    // Returns a fresh handle to the same underlying bool, intended to be
    // moved into a sampler thread that outlives the originating tauri::State.
    fn clone_arc_for_thread(&self) -> ArcMutexBool {
        ArcMutexBool(Arc::clone(&self.0))
    }
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(override_dir) = std::env::var("AI_PET_USER_DATA_DIR") {
        let dir = PathBuf::from(override_dir);
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        return Ok(dir);
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn read_json(path: &PathBuf, fallback: Value) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .unwrap_or(fallback)
}

fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        path,
        serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn pet_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("pet.json"))
}

fn reminders_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("reminders.json"))
}

fn diary_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("diary.json"))
}

// Activity samples persist alongside the diary so a relaunch keeps the
// counter from resetting mid-day. We store per-day minute totals because
// the source of truth (system idle counter) is otherwise volatile.
fn activity_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("activity.json"))
}

// User-supplied wardrobe PNGs live under <data_dir>/wardrobe/<id>.png.
// Renderer reads via list_user_wardrobe_assets and overlays them on top
// of bundled assets. The directory is created lazily on first read so a
// fresh install doesn't leave an empty folder lying around.
fn user_wardrobe_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("wardrobe"))
}

fn user_pet_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("pets"))
}

fn screen_tools_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("tools"))
}

#[cfg(target_os = "macos")]
fn ensure_screen_ocr_binary(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let tools_dir = screen_tools_dir(app)?;
    fs::create_dir_all(&tools_dir).map_err(|error| error.to_string())?;
    let source_path = tools_dir.join("aievopet-ocr.swift");
    let binary_path = tools_dir.join("aievopet-ocr");
    let embedded_source = include_str!("../swift/aievopet-ocr.swift");

    let source_needs_write = fs::read_to_string(&source_path)
        .map(|existing| existing != embedded_source)
        .unwrap_or(true);
    if source_needs_write {
        fs::write(&source_path, embedded_source).map_err(|error| error.to_string())?;
    }

    if binary_path.exists() {
        return Ok(binary_path);
    }

    let compile = Command::new("swiftc")
        .arg(&source_path)
        .arg("-O")
        .arg("-o")
        .arg(&binary_path)
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .output()
        .map_err(|error| format!("failed to launch swiftc: {}", error))?;
    if !compile.status.success() {
        let stderr = String::from_utf8_lossy(&compile.stderr);
        return Err(format!("swiftc failed: {}", stderr.trim()));
    }
    Ok(binary_path)
}

#[cfg(target_os = "macos")]
fn capture_screen_to_path(path: &PathBuf) -> Result<(), String> {
    let status = Command::new("screencapture")
        .arg("-x")
        .arg("-t")
        .arg("png")
        .arg(path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("failed to run screencapture: {}", error))?;

    if !status.success() {
        return Err("screencapture failed (check macOS Screen Recording permission)".into());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn run_screen_ocr(binary_path: &PathBuf, screenshot_path: &PathBuf) -> Result<String, String> {
    let output = Command::new(binary_path)
        .arg(screenshot_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("failed to run OCR helper: {}", error))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR helper failed: {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn capture_screen_text(app: tauri::AppHandle) -> Result<ScreenAwarenessResult, String> {
    #[cfg(target_os = "macos")]
    {
        let temp_dir = std::env::temp_dir();
        let screenshot_path = temp_dir.join(format!(
            "aievopet-screen-{}-{}.png",
            Utc::now().timestamp_millis(),
            std::process::id()
        ));
        capture_screen_to_path(&screenshot_path)?;
        let ocr_bin = ensure_screen_ocr_binary(&app)?;
        let raw_text = run_screen_ocr(&ocr_bin, &screenshot_path)?;
        let _ = fs::remove_file(&screenshot_path);

        let mut lines = raw_text
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>();
        if lines.is_empty() {
            return Ok(ScreenAwarenessResult {
                supported: true,
                platform: "macos".into(),
                text: String::new(),
                line_count: 0,
                screenshot_path: None,
                error: None,
            });
        }

        let mut text = lines.join("\n");
        if text.len() > SCREEN_AWARENESS_MAX_CHARS {
            text.truncate(SCREEN_AWARENESS_MAX_CHARS);
        }
        lines.truncate(200);

        return Ok(ScreenAwarenessResult {
            supported: true,
            platform: "macos".into(),
            text,
            line_count: lines.len(),
            screenshot_path: None,
            error: None,
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(ScreenAwarenessResult {
            supported: false,
            platform: std::env::consts::OS.to_string(),
            text: String::new(),
            line_count: 0,
            screenshot_path: None,
            error: Some("Screen awareness MVP is currently implemented on macOS only".into()),
        })
    }
}

fn monitor_size(app: &tauri::AppHandle) -> Result<(f64, f64), String> {
    let monitor = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| {
            app.available_monitors()
                .ok()
                .and_then(|mut monitors| monitors.pop())
        });

    Ok(monitor
        .map(|monitor| {
            let size = monitor.size();
            (size.width as f64, size.height as f64)
        })
        .unwrap_or((1440.0, 900.0)))
}

fn model_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("model.json"))
}

fn export_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("exports").join(file_name))
}

fn domain_path(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("domains").join(format!("{}.json", key)))
}

fn default_model_config() -> ModelConfig {
    ModelConfig {
        enabled: true,
        provider: "ollama".into(),
        endpoint: "http://127.0.0.1:11434".into(),
        model: "qwen3:4b-instruct".into(),
        timeout_ms: 12_000,
    }
}

fn parse_datetime(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|datetime| datetime.with_timezone(&Utc))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn now_value() -> Value {
    Value::String(now_iso())
}

fn sanitize_file_stem(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    sanitized.trim_matches('-').to_string()
}

fn normalize_endpoint_base(endpoint: &str) -> String {
    endpoint.trim().trim_end_matches('/').to_string()
}

fn model_healthcheck_url(endpoint: &str) -> String {
    format!("{}/api/tags", normalize_endpoint_base(endpoint))
}

fn can_connect_http(url: &str, timeout_ms: u64) -> bool {
    let timeout = timeout_ms.max(1000).min(5000);
    let quoted_url = format!("\"{}\"", url.replace('"', "\\\""));
    let command = format!(
        "curl -sS --fail --max-time {} {} >/dev/null",
        (timeout / 1000).max(1),
        quoted_url
    );
    Command::new("sh")
        .arg("-lc")
        .arg(command)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn wait_for_model_service(endpoint: &str, timeout_ms: u64) -> bool {
    let deadline =
        std::time::Instant::now() + StdDuration::from_millis(timeout_ms.max(2000).min(20000));
    let url = model_healthcheck_url(endpoint);
    while std::time::Instant::now() < deadline {
        if can_connect_http(&url, 1500) {
            return true;
        }
        thread::sleep(StdDuration::from_millis(400));
    }
    false
}

fn spawn_ollama_app() -> Result<(), String> {
    Command::new("open")
        .arg("-a")
        .arg("Ollama")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn ollama_cli_candidates() -> Vec<String> {
    vec![
        "ollama".into(),
        "/opt/homebrew/bin/ollama".into(),
        "/usr/local/bin/ollama".into(),
    ]
}

fn spawn_ollama_cli() -> Result<(), String> {
    let mut last_error = None;
    for candidate in ollama_cli_candidates() {
        match Command::new(&candidate)
            .arg("serve")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(_) => return Ok(()),
            Err(error) => last_error = Some(format!("{}: {}", candidate, error)),
        }
    }
    Err(last_error.unwrap_or_else(|| "ollama CLI unavailable".into()))
}

#[tauri::command]
fn ensure_model_service(config: ModelConfig) -> Result<ModelServiceEnsureResult, String> {
    if !config.enabled {
        return Ok(ModelServiceEnsureResult {
            already_running: false,
            attempted_start: false,
            connected: false,
            launch_method: None,
            error: Some("disabled".into()),
        });
    }

    if config.provider.trim() != "ollama" {
        return Ok(ModelServiceEnsureResult {
            already_running: false,
            attempted_start: false,
            connected: false,
            launch_method: None,
            error: Some("unsupported provider".into()),
        });
    }

    if wait_for_model_service(&config.endpoint, 1200) {
        return Ok(ModelServiceEnsureResult {
            already_running: true,
            attempted_start: false,
            connected: true,
            launch_method: None,
            error: None,
        });
    }

    let mut last_error = None;

    if spawn_ollama_app().is_ok() {
        if wait_for_model_service(&config.endpoint, config.timeout_ms.saturating_add(8000)) {
            return Ok(ModelServiceEnsureResult {
                already_running: false,
                attempted_start: true,
                connected: true,
                launch_method: Some("app".into()),
                error: None,
            });
        }
        last_error = Some("已尝试打开 Ollama.app，但服务未在预期时间内就绪".into());
    }

    match spawn_ollama_cli() {
        Ok(_) => {
            if wait_for_model_service(&config.endpoint, config.timeout_ms.saturating_add(8000)) {
                return Ok(ModelServiceEnsureResult {
                    already_running: false,
                    attempted_start: true,
                    connected: true,
                    launch_method: Some("cli".into()),
                    error: None,
                });
            }
            last_error = Some("已尝试执行 ollama serve，但服务未在预期时间内就绪".into());
        }
        Err(error) => {
            last_error = Some(format!(
                "未找到 Ollama。请先安装 Ollama.app 或提供可用的 ollama 命令。({})",
                error
            ))
        }
    }

    Ok(ModelServiceEnsureResult {
        already_running: false,
        attempted_start: true,
        connected: false,
        launch_method: None,
        error: last_error,
    })
}

fn build_ics_content(input: &CalendarEventWriteInput, event_id: &str, created_at: &str) -> String {
    let dt_stamp = created_at.replace(['-', ':'], "").replace("+00:00", "Z");
    let dt_start = input
        .starts_at
        .replace(['-', ':'], "")
        .replace("+00:00", "Z");
    let dt_end = input
        .ends_at
        .clone()
        .unwrap_or_else(|| {
            (parse_datetime(&input.starts_at).unwrap_or_else(Utc::now)
                + ChronoDuration::minutes(25))
            .to_rfc3339()
        })
        .replace(['-', ':'], "")
        .replace("+00:00", "Z");
    let summary = input.title.replace(['\n', '\r'], " ");
    let description = input
        .notes
        .clone()
        .unwrap_or_default()
        .replace(['\n', '\r'], "\\n");

    format!(
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AIEvoPet//Calendar Export//EN\r\nBEGIN:VEVENT\r\nUID:{event_id}\r\nDTSTAMP:{dt_stamp}\r\nDTSTART:{dt_start}\r\nDTEND:{dt_end}\r\nSUMMARY:{summary}\r\nDESCRIPTION:{description}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
  )
}

fn write_calendar_event_file(
    app: &tauri::AppHandle,
    input: &CalendarEventWriteInput,
) -> Result<CalendarEventWriteResult, String> {
    let provider = if input.provider == "eventkit" {
        "eventkit"
    } else {
        "ics"
    };
    let created_at = now_iso();
    let event_id = format!("pet-calendar-{}", Utc::now().timestamp_millis());
    let file_name = format!(
        "{}-{}.ics",
        sanitize_file_stem(&input.title),
        Utc::now().format("%Y%m%d-%H%M%S")
    );
    let path = export_path(app, &file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let ics = build_ics_content(input, &event_id, &created_at);
    fs::write(&path, ics).map_err(|error| error.to_string())?;

    Ok(CalendarEventWriteResult {
        provider: provider.into(),
        target: "ics-file".into(),
        event_id: Some(event_id),
        file_path: Some(path.to_string_lossy().to_string()),
        fallback: provider == "eventkit",
    })
}

fn normalize_coding_event(event: CodingEvent) -> Result<CodingEvent, String> {
    let kind = event.kind.trim().to_string();
    let source = event.source.trim().to_string();
    let title = event.title.trim().to_string();
    let status = event.status.trim().to_string();

    if event.id.trim().is_empty() {
        return Err("coding event id required".into());
    }
    if title.is_empty() {
        return Err("coding event title required".into());
    }
    if parse_datetime(&event.created_at).is_none() {
        return Err("invalid coding event created_at".into());
    }
    if !matches!(
        kind.as_str(),
        "task-start"
            | "task-done"
            | "task-failed"
            | "commit-created"
            | "test-pass"
            | "test-fail"
            | "build-pass"
            | "build-fail"
    ) {
        return Err("invalid coding event kind".into());
    }
    if !matches!(
        source.as_str(),
        "claude-code" | "codex" | "cursor" | "vscode" | "skill" | "manual"
    ) {
        return Err("invalid coding event source".into());
    }
    if !matches!(status.as_str(), "running" | "succeeded" | "failed") {
        return Err("invalid coding event status".into());
    }

    Ok(CodingEvent {
        id: event.id,
        kind,
        source,
        title,
        summary: event
            .summary
            .map(|summary| summary.trim().to_string())
            .filter(|summary| !summary.is_empty()),
        status,
        created_at: event.created_at,
        metadata: event.metadata,
    })
}

fn coding_event_display_source(source: &str) -> &'static str {
    match source {
        "claude-code" => "Claude Code",
        "cursor" => "Cursor",
        "vscode" => "VS Code",
        "codex" => "Codex",
        "skill" => "技能",
        _ => "任务",
    }
}

fn is_generic_coding_event_text(text: &str) -> bool {
    let normalized = text.trim();
    let lower = normalized.to_ascii_lowercase();
    normalized.is_empty()
        || lower.starts_with("agent has stopped")
        || lower.starts_with("claude code finished a turn")
        || lower.starts_with("notification raised by the claude code agent")
        || normalized == "Claude Code 已完成一个任务。"
        || normalized == "任务：未识别到具体说明。需要你：不用操作，已完成。"
}

fn coding_event_metadata_text(event: &CodingEvent, key: &str) -> Option<String> {
    event
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get(key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn is_permission_attention_event(event: &CodingEvent) -> bool {
    coding_event_metadata_text(event, "hookEventName").as_deref() == Some("PermissionRequest")
        || coding_event_metadata_text(event, "notificationType").as_deref() == Some("permission_prompt")
}

fn extract_coding_task_text(summary: Option<&str>) -> Option<String> {
    let text = summary?.trim();
    let task = text.strip_prefix("任务：")?;
    let (task, rest) = task.split_once("。需要你：")?;
    if rest == "不用操作，已完成。" || rest == "不用操作，已完成" {
        let task = task.trim();
        if !task.is_empty() {
            return Some(task.to_string());
        }
    }
    None
}

fn coding_event_primary_text(event: &CodingEvent) -> String {
    if let Some(task_name) = coding_event_metadata_text(event, "taskName")
        .or_else(|| extract_coding_task_text(event.summary.as_deref()))
    {
        return format!("任务：{}", task_name);
    }

    if let Some(command) = coding_event_metadata_text(event, "command") {
        let mut chars = command.chars();
        let truncated: String = chars.by_ref().take(80).collect();
        return if chars.next().is_some() {
            format!("{}…", truncated)
        } else {
            command
        };
    }

    if let Some(summary) = event.summary.as_deref().map(str::trim) {
        if !is_generic_coding_event_text(summary) {
            return summary.to_string();
        }
    }

    let title = event.title.trim();
    if is_generic_coding_event_text(title) {
        format!("{} 事件已收到", coding_event_display_source(&event.source))
    } else {
        title.to_string()
    }
}

fn coding_event_status_text(event: &CodingEvent) -> &'static str {
    if event.kind == "task-done" && event.status == "succeeded" {
        return "完成了任务";
    }
    if event.status == "failed"
        || matches!(
            event.kind.as_str(),
            "task-failed" | "test-fail" | "build-fail"
        )
    {
        return "需要你操作";
    }
    if event.status == "running" || event.kind == "task-start" {
        return "正在处理";
    }
    "收到事件"
}

fn coding_event_notification_title(event: &CodingEvent) -> String {
    format!(
        "{}｜{}",
        coding_event_display_source(&event.source),
        coding_event_status_text(event)
    )
}

fn coding_event_display_text(event: &CodingEvent) -> String {
    let text = coding_event_primary_text(event);
    format!(
        "【{}｜{}】\n{}",
        coding_event_display_source(&event.source),
        coding_event_status_text(event),
        text
    )
}

fn coding_event_action(event: &CodingEvent) -> &'static str {
    if event.kind == "commit-created" {
        return "happy";
    }
    if event.status == "failed"
        || matches!(
            event.kind.as_str(),
            "task-failed" | "test-fail" | "build-fail"
        )
    {
        return "alert";
    }
    if event.status == "running" || event.kind == "task-start" {
        return "talking";
    }
    "happy"
}

fn coding_event_pet_emotion(action: &str, loneliness: f64) -> &'static str {
    if matches!(action, "happy" | "blush") {
        return "happy";
    }
    if action == "sleepy" {
        return "calm";
    }
    if action == "hungry" {
        return "sad";
    }
    if matches!(action, "talking" | "alert") {
        return if loneliness > 55.0 {
            "lonely"
        } else {
            "excited"
        };
    }
    if loneliness > 55.0 {
        "lonely"
    } else {
        "calm"
    }
}

fn coding_event_should_record_memory(event: &CodingEvent) -> bool {
    !(event.status == "running" || event.kind == "task-start")
}

fn coding_event_is_muted(pet_root: &Map<String, Value>, event: &CodingEvent) -> bool {
    let system = pet_root
        .get("ui")
        .and_then(Value::as_object)
        .and_then(|ui| ui.get("system"))
        .and_then(Value::as_object);
    let vacation_mode = system
        .and_then(|system| system.get("vacationMode"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let boss_mode = system
        .and_then(|system| system.get("bossModeEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    (vacation_mode || boss_mode) && event.status == "running"
}

fn coding_event_should_fire_strong_reminder(
    pet_root: &Map<String, Value>,
    event: &CodingEvent,
) -> bool {
    let system = pet_root
        .get("ui")
        .and_then(Value::as_object)
        .and_then(|ui| ui.get("system"))
        .and_then(Value::as_object);
    let vacation_mode = system
        .and_then(|system| system.get("vacationMode"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let boss_mode = system
        .and_then(|system| system.get("bossModeEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let nest_mode = system
        .and_then(|system| system.get("nestModeEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let strong_reminder_enabled = system
        .and_then(|system| system.get("strongReminderEnabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if vacation_mode || boss_mode || nest_mode {
        return false;
    }
    if strong_reminder_enabled {
        return event.status != "running" && !is_permission_attention_event(event);
    }
    if matches!(
        event.kind.as_str(),
        "task-failed" | "build-fail" | "test-fail"
    ) {
        return !is_permission_attention_event(event);
    }
    if event.status == "failed" {
        return !is_permission_attention_event(event);
    }
    event.kind == "task-done" && event.status == "succeeded"
}

fn persist_coding_event_pet_memory(
    app: &tauri::AppHandle,
    event: &CodingEvent,
) -> Result<(), String> {
    if !coding_event_should_record_memory(event) {
        return Ok(());
    }

    let path = pet_path(app)?;
    let mut pet_root = match read_json(&path, Value::Null) {
        Value::Object(map) => map,
        _ => return Ok(()),
    };

    if coding_event_is_muted(&pet_root, event) {
        return Ok(());
    }

    let current_scene = pet_root
        .get("memory")
        .and_then(Value::as_object)
        .and_then(|memory| memory.get("working"))
        .and_then(Value::as_object)
        .and_then(|working| working.get("currentScene"))
        .and_then(Value::as_str)
        .unwrap_or("idle")
        .to_string();
    let loneliness = pet_root
        .get("state")
        .and_then(Value::as_object)
        .and_then(|state| state.get("loneliness"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let action = coding_event_action(event);
    let summary = event.summary.as_deref().unwrap_or(&event.title).to_string();
    let importance = if event.status == "failed" || event.kind == "commit-created" {
        3
    } else {
        2
    };

    let existing_events = pet_root
        .get("memory")
        .and_then(Value::as_object)
        .and_then(|memory| memory.get("events"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if existing_events
        .iter()
        .any(|entry| entry.get("id").and_then(Value::as_str) == Some(event.id.as_str()))
    {
        return Ok(());
    }

    let mut next_events = Vec::with_capacity(existing_events.len() + 1);
    next_events.push(json!({
      "id": event.id,
      "ts": event.created_at,
      "type": event.kind,
      "summary": summary,
      "petEmotion": coding_event_pet_emotion(action, loneliness),
      "importance": importance,
      "sceneId": current_scene,
      "tags": [event.kind, event.source, event.status, current_scene]
    }));
    next_events.extend(existing_events.into_iter());
    if next_events.len() > 40 {
        next_events.truncate(40);
    }

    let memory = pet_root.entry("memory").or_insert_with(|| json!({}));
    if !memory.is_object() {
        *memory = json!({});
    }
    let memory_object = memory.as_object_mut().ok_or("invalid pet memory")?;
    memory_object.insert("events".into(), Value::Array(next_events));

    let pet_value = Value::Object(pet_root);
    write_json(&path, &pet_value)?;
    app.emit("pet-updated", pet_value)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn persist_coding_event_audit(app: &tauri::AppHandle, event: &CodingEvent) -> Result<(), String> {
    let pet_root = match read_json(&pet_path(app)?, Value::Null) {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    if coding_event_is_muted(&pet_root, event) {
        return Ok(());
    }

    let path = domain_path(app, "audit")?;
    let mut envelope = match normalize_domain_envelope(
        "audit",
        read_json(&path, default_domain_envelope("audit")),
    ) {
        Value::Object(map) => map,
        _ => return Err("invalid audit domain envelope".into()),
    };

    let data = envelope
        .entry("data")
        .or_insert_with(|| default_domain_data("audit"));
    if !data.is_object() {
        *data = default_domain_data("audit");
    }
    let data_object = data.as_object_mut().ok_or("invalid audit domain data")?;
    let entries = data_object.entry("entries").or_insert_with(|| json!([]));
    if !entries.is_array() {
        *entries = json!([]);
    }
    let entries_array = entries
        .as_array_mut()
        .ok_or("invalid audit domain entries")?;
    if entries_array.iter().any(|entry| {
        entry
            .get("metadata")
            .and_then(Value::as_object)
            .and_then(|metadata| metadata.get("eventId"))
            .and_then(Value::as_str)
            == Some(event.id.as_str())
    }) {
        return Ok(());
    }

    let mut metadata = Map::new();
    metadata.insert("source".into(), Value::String(event.source.clone()));
    metadata.insert("status".into(), Value::String(event.status.clone()));
    metadata.insert(
        "statusText".into(),
        Value::String(coding_event_status_text(event).into()),
    );
    metadata.insert("eventId".into(), Value::String(event.id.clone()));
    if let Some(extra) = &event.metadata {
        for (key, value) in extra {
            metadata.insert(key.clone(), value.clone());
        }
    }

    entries_array.insert(
        0,
        json!({
          "id": format!("audit-{}-{}", Utc::now().timestamp_millis(), event.id),
          "at": now_iso(),
          "actor": "system",
          "domain": "tools",
          "action": format!("coding.{}", event.kind),
          "summary": format!("{}：{}", coding_event_status_text(event), coding_event_primary_text(event)),
          "metadata": metadata
        }),
    );
    if entries_array.len() > 200 {
        entries_array.truncate(200);
    }
    envelope.insert("updatedAt".into(), now_value());

    let envelope_value = Value::Object(envelope);
    write_json(&path, &envelope_value)?;
    app.emit(
        "domain-state-updated",
        json!({
          "key": "audit",
          "envelope": envelope_value.clone()
        }),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn persist_coding_event_side_effects(
    app: &tauri::AppHandle,
    event: &CodingEvent,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    {
        let mut recent_ids = app_state
            .recent_coding_event_ids
            .lock()
            .map_err(|error| error.to_string())?;
        if recent_ids.contains(&event.id) {
            return Ok(());
        }
        recent_ids.insert(event.id.clone());
        if recent_ids.len() > 256 {
            recent_ids.clear();
            recent_ids.insert(event.id.clone());
        }
    }

    persist_coding_event_pet_memory(app, event)?;
    persist_coding_event_audit(app, event)?;

    // Reliability path: fire strong reminders directly in Rust when coding
    // events arrive, so reminders still work even if a renderer-side
    // subscription misses the event. We mirror the same gating rules used
    // in the JS controller (quiet modes suppress, strong-reminder widens
    // to all non-running events, otherwise only done/fail events).
    let pet_root = match read_json(&pet_path(app)?, Value::Null) {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    if coding_event_should_fire_strong_reminder(&pet_root, event) {
        let _ = bring_pet_to_active_monitor_for_event(app, event);
        let _ = notify_user_strong(
            app.clone(),
            coding_event_notification_title(event),
            coding_event_display_text(event),
        );
    }
    Ok(())
}

fn emit_coding_event_to_windows(app: &tauri::AppHandle, event: &CodingEvent) -> Result<(), String> {
    app.emit("coding-event", event.clone())
        .map_err(|error| error.to_string())
}

fn read_http_body(
    stream: &mut std::net::TcpStream,
    header_block: &str,
    initial: &[u8],
) -> Result<Vec<u8>, String> {
    let content_length = header_block
        .lines()
        .find_map(|line| {
            let lower = line.to_ascii_lowercase();
            lower
                .strip_prefix("content-length:")
                .and_then(|value| value.trim().parse::<usize>().ok())
        })
        .unwrap_or(0);

    let mut body = initial.to_vec();
    while body.len() < content_length {
        let mut chunk = [0_u8; 2048];
        let read = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..read]);
    }
    body.truncate(content_length);
    Ok(body)
}

fn write_http_json(
    stream: &mut std::net::TcpStream,
    status: &str,
    body: Value,
) -> Result<(), String> {
    let payload = serde_json::to_string(&body).map_err(|error| error.to_string())?;
    let response = format!(
    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
    payload.len(),
    payload
  );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())
}

fn handle_bridge_connection(
    app: &tauri::AppHandle,
    mut stream: std::net::TcpStream,
) -> Result<(), String> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];
    let header_end;

    loop {
        let read = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("empty bridge request".into());
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(index) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            header_end = index + 4;
            break;
        }
        if buffer.len() > 64 * 1024 {
            return Err("bridge request too large".into());
        }
    }

    let header_block = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let mut lines = header_block.lines();
    let request_line = lines.next().unwrap_or_default().trim().to_string();
    let body = read_http_body(&mut stream, &header_block, &buffer[header_end..])?;

    if request_line.starts_with("OPTIONS ") {
        return write_http_json(&mut stream, "200 OK", json!({ "ok": true }));
    }

    if !request_line.starts_with("POST /coding-event") {
        return write_http_json(
            &mut stream,
            "404 Not Found",
            json!({ "ok": false, "error": "not found" }),
        );
    }

    let parsed = serde_json::from_slice::<Value>(&body).map_err(|error| error.to_string())?;
    let event_value = parsed
        .get("event")
        .cloned()
        .ok_or("event payload required")?;
    let event =
        serde_json::from_value::<CodingEvent>(event_value).map_err(|error| error.to_string())?;
    let normalized = normalize_coding_event(event)?;
    persist_coding_event_side_effects(app, &normalized)?;
    emit_coding_event_to_windows(app, &normalized)?;
    write_http_json(
        &mut stream,
        "200 OK",
        json!({ "ok": true, "event": normalized }),
    )
}

fn ensure_coding_event_bridge(
    app: &tauri::AppHandle,
    state: &tauri::State<AppState>,
) -> Result<(), String> {
    let mut started = state
        .coding_event_bridge_started
        .lock()
        .map_err(|error| error.to_string())?;
    if *started {
        return Ok(());
    }
    *started = true;
    drop(started);

    let listener = TcpListener::bind(("127.0.0.1", CODING_EVENT_BRIDGE_PORT))
        .map_err(|error| error.to_string())?;
    let app_handle = app.clone();
    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let _ = handle_bridge_connection(&app_handle, stream);
                }
                Err(_) => continue,
            }
        }
    });

    Ok(())
}

fn valid_domain_key(key: &str) -> bool {
    matches!(
        key,
        "inventory"
            | "economy"
            | "home"
            | "jobs"
            | "achievements"
            | "planner"
            | "calendar"
            | "tools"
            | "oracle"
            | "system"
            | "audit"
    )
}

fn default_domain_data(key: &str) -> Value {
    match key {
        "inventory" => json!({
          "items": [],
          "equippedWardrobeSlots": {}
        }),
        "economy" => json!({
          "pawcoin": 0,
          "lifetimeEarned": 0,
          "lifetimeSpent": 0,
          "pendingRewards": []
        }),
        "home" => json!({
          "roomTier": "starter",
          "comfort": 0,
          "furniture": []
        }),
        "jobs" => json!({
          "unlockedJobs": [],
          "completedJobs": 0
        }),
        "achievements" => json!({
          "unlocked": [],
          "exportedCards": 0
        }),
        "planner" => json!({}),
        "calendar" => json!({
          "provider": "none",
          "permissions": { "granted": false },
          "blacklistedCalendars": [],
          "auditLockKeywords": []
        }),
        "tools" => json!({
          "enabledTools": ["reminder.create", "memory.update", "interaction.run", "scene.hint"],
          "promptsRequiredFor": [],
          "lastUsedAtByTool": {}
        }),
        "oracle" => json!({
          "history": []
        }),
        "system" => json!({
          "vacationMode": { "enabled": false },
          "doNotDisturb": { "enabled": false },
          "bossKeyEnabled": false,
          "autoLaunchEnabled": false
        }),
        "audit" => json!({
          "entries": []
        }),
        _ => Value::Object(Map::new()),
    }
}

fn default_domain_envelope(key: &str) -> Value {
    json!({
      "schemaVersion": 1,
      "updatedAt": now_iso(),
      "data": default_domain_data(key)
    })
}

fn normalize_domain_envelope(key: &str, value: Value) -> Value {
    let fallback = default_domain_envelope(key);
    let fallback_object = fallback.as_object().cloned().unwrap_or_default();
    let mut object = match value {
        Value::Object(map) => map,
        _ => fallback_object.clone(),
    };

    if !object.contains_key("schemaVersion") {
        object.insert("schemaVersion".into(), Value::Number(1.into()));
    }
    if !object.contains_key("updatedAt") {
        object.insert("updatedAt".into(), now_value());
    }
    if !matches!(object.get("data"), Some(Value::Object(_))) {
        object.insert(
            "data".into(),
            fallback_object
                .get("data")
                .cloned()
                .unwrap_or_else(|| default_domain_data(key)),
        );
    }

    Value::Object(object)
}

fn resolve_stage_by_age(current_stage: &str, hatched_at: &Option<String>, age_days: i64) -> String {
    if current_stage == "egg" && hatched_at.is_none() {
        return "egg".into();
    }
    if age_days >= 30 {
        return "elder".into();
    }
    if age_days >= 14 {
        return "adult".into();
    }
    if age_days >= 3 {
        return "child".into();
    }
    "baby".into()
}

fn reconcile_pet_state(pet: &mut PetEnvelope, now: DateTime<Utc>) {
    let Ok(last_interaction) = DateTime::parse_from_rfc3339(&pet.state.last_interaction_at) else {
        return;
    };
    let last_interaction = last_interaction.with_timezone(&Utc);
    let elapsed_minutes =
        ((now.timestamp_millis() - last_interaction.timestamp_millis()) / 60_000).max(0);

    if elapsed_minutes == 0 {
        return;
    }

    let elapsed = elapsed_minutes as f64;
    let hunger_delta = if pet.state.is_sleeping {
        elapsed * 0.18
    } else {
        elapsed * 0.42
    };
    let energy_delta = if pet.state.is_sleeping {
        elapsed * 0.32
    } else {
        -elapsed * 0.28
    };
    let loneliness_delta = if pet.state.is_sleeping {
        elapsed * 0.08
    } else {
        elapsed * 0.22
    };
    let cleanliness_delta = if pet.state.is_sleeping {
        -elapsed * 0.04
    } else {
        -elapsed * 0.1
    };
    let health_delta = -((pet.state.hunger - 78.0).max(0.0) * 0.01 * elapsed)
        - ((24.0 - pet.state.cleanliness).max(0.0) * 0.012 * elapsed);
    let mood_delta = -(elapsed * 0.16)
        - if pet.state.hunger > 70.0 {
            elapsed * 0.08
        } else {
            0.0
        }
        - if pet.state.cleanliness < 28.0 {
            elapsed * 0.05
        } else {
            0.0
        };

    let base_age_from = pet
        .state
        .hatched_at
        .as_deref()
        .unwrap_or(&pet.state.last_interaction_at);
    let age_days = parse_datetime(base_age_from)
        .map(|hatched_at| {
            ((now.timestamp_millis() - hatched_at.timestamp_millis()) / 86_400_000).max(0)
        })
        .unwrap_or(pet.state.age_days)
        .max(pet.state.age_days);

    pet.state.stage = resolve_stage_by_age(&pet.state.stage, &pet.state.hatched_at, age_days);
    pet.state.age_days = age_days;
    pet.state.hunger = clamp(pet.state.hunger + hunger_delta, 0.0, 100.0);
    pet.state.energy = clamp(pet.state.energy + energy_delta, 0.0, 100.0);
    pet.state.loneliness = clamp(pet.state.loneliness + loneliness_delta, 0.0, 100.0);
    pet.state.cleanliness = clamp(pet.state.cleanliness + cleanliness_delta, 0.0, 100.0);
    pet.state.health = clamp(pet.state.health + health_delta, 0.0, 100.0);
    pet.state.mood = clamp(pet.state.mood + mood_delta, 0.0, 100.0);
    pet.state.last_interaction_at = now.to_rfc3339();
}

fn active_reminder_time(reminder: &ReminderItem) -> &str {
    reminder
        .snooze_until
        .as_deref()
        .unwrap_or(&reminder.scheduled_at)
}

fn pet_tick_paused(root: &serde_json::Map<String, Value>, now: DateTime<Utc>) -> bool {
    if root
        .get("pauseTick")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return true;
    }

    root.get("pauseUntil")
        .and_then(Value::as_str)
        .and_then(parse_datetime)
        .map(|pause_until| pause_until > now)
        .unwrap_or(false)
}

fn reminder_sort_key(reminder: &ReminderItem) -> i64 {
    parse_datetime(active_reminder_time(reminder))
        .map(|datetime| datetime.timestamp_millis())
        .unwrap_or(i64::MAX)
}

fn normalize_reminder_intensity(value: Option<&str>) -> String {
    match value {
        Some("low") => "low".into(),
        Some("high") => "high".into(),
        _ => "medium".into(),
    }
}

fn load_reminder_state(app: &tauri::AppHandle) -> Result<Vec<ReminderItem>, String> {
    let path = reminders_path(app)?;
    let mut reminders: Vec<ReminderItem> =
        serde_json::from_value(read_json(&path, json!([]))).map_err(|error| error.to_string())?;
    reminders.sort_by_key(reminder_sort_key);
    Ok(reminders)
}

fn save_reminder_state(app: &tauri::AppHandle, reminders: &[ReminderItem]) -> Result<(), String> {
    let path = reminders_path(app)?;
    let value = serde_json::to_value(reminders).map_err(|error| error.to_string())?;
    write_json(&path, &value)?;
    app.emit("reminders-updated", reminders.to_vec())
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn event_memory_timestamp(event: &Value) -> i64 {
    event
        .get("ts")
        .and_then(Value::as_str)
        .and_then(parse_datetime)
        .map(|datetime| datetime.timestamp_millis())
        .unwrap_or(i64::MIN)
}

fn pet_is_hatched(value: &Value) -> bool {
    let stage = value
        .get("state")
        .and_then(Value::as_object)
        .and_then(|state| state.get("stage"))
        .and_then(Value::as_str);
    let hatched_at = value
        .get("state")
        .and_then(Value::as_object)
        .and_then(|state| state.get("hatchedAt"))
        .and_then(Value::as_str);
    let onboarding_completed = value
        .get("ui")
        .and_then(Value::as_object)
        .and_then(|ui| ui.get("onboardingCompleted"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    matches!(stage, Some("baby" | "child" | "adult" | "elder"))
        || hatched_at.is_some()
        || onboarding_completed
}

fn pet_is_unhatched(value: &Value) -> bool {
    let stage = value
        .get("state")
        .and_then(Value::as_object)
        .and_then(|state| state.get("stage"))
        .and_then(Value::as_str);
    let hatched_at = value
        .get("state")
        .and_then(Value::as_object)
        .and_then(|state| state.get("hatchedAt"))
        .and_then(Value::as_str);
    let onboarding_completed = value
        .get("ui")
        .and_then(Value::as_object)
        .and_then(|ui| ui.get("onboardingCompleted"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    stage == Some("egg") && hatched_at.is_none() && !onboarding_completed
}

fn preserve_existing_hatched_lifecycle(existing: &Value, incoming_root: &mut Map<String, Value>) {
    if !pet_is_hatched(existing) || !pet_is_unhatched(&Value::Object(incoming_root.clone())) {
        return;
    }

    for key in ["personality", "state"] {
        if let Some(value) = existing.get(key) {
            incoming_root.insert(key.into(), value.clone());
        }
    }

    if let Some(existing_ui) = existing.get("ui").and_then(Value::as_object) {
        let incoming_ui = incoming_root.entry("ui").or_insert_with(|| json!({}));
        if !incoming_ui.is_object() {
            *incoming_ui = json!({});
        }
        if let Some(incoming_ui) = incoming_ui.as_object_mut() {
            for key in ["onboardingCompleted", "onboarding", "wardrobeSelection"] {
                if let Some(value) = existing_ui.get(key) {
                    incoming_ui.insert(key.into(), value.clone());
                }
            }
        }
    }

    if let Some(existing_memory) = existing.get("memory").and_then(Value::as_object) {
        let incoming_memory = incoming_root.entry("memory").or_insert_with(|| json!({}));
        if !incoming_memory.is_object() {
            *incoming_memory = json!({});
        }
        if let Some(incoming_memory) = incoming_memory.as_object_mut() {
            for key in ["profile", "bond", "relationship", "daily", "traits"] {
                if let Some(value) = existing_memory.get(key) {
                    incoming_memory.insert(key.into(), value.clone());
                }
            }
        }
    }
}

fn timestamp_millis(value: Option<&Value>) -> Option<i64> {
    value
        .and_then(Value::as_str)
        .and_then(|raw| DateTime::parse_from_rfc3339(raw).ok())
        .map(|parsed| parsed.timestamp_millis())
}

fn preserve_newer_existing_appearance(existing: &Value, incoming_root: &mut Map<String, Value>) {
    let existing_changed_at = timestamp_millis(existing.pointer("/ui/speciesChangedAt"));
    let incoming_changed_at = timestamp_millis(
        incoming_root
            .get("ui")
            .and_then(|ui| ui.get("speciesChangedAt")),
    );

    if existing_changed_at.is_none() || incoming_changed_at >= existing_changed_at {
        return;
    }

    if let Some(existing_species) = existing.pointer("/personality/species").cloned() {
        let personality = incoming_root
            .entry("personality")
            .or_insert_with(|| json!({}));
        if !personality.is_object() {
            *personality = json!({});
        }
        if let Some(personality) = personality.as_object_mut() {
            personality.insert("species".into(), existing_species);
        }
    }

    if let Some(existing_profile) = existing
        .pointer("/memory/profile")
        .and_then(Value::as_object)
    {
        let incoming_memory = incoming_root.entry("memory").or_insert_with(|| json!({}));
        if !incoming_memory.is_object() {
            *incoming_memory = json!({});
        }
        if let Some(incoming_memory) = incoming_memory.as_object_mut() {
            let incoming_profile = incoming_memory
                .entry("profile")
                .or_insert_with(|| json!({}));
            if !incoming_profile.is_object() {
                *incoming_profile = json!({});
            }
            if let Some(incoming_profile) = incoming_profile.as_object_mut() {
                if let Some(value) = existing_profile.get("chosenSpecies") {
                    incoming_profile.insert("chosenSpecies".into(), value.clone());
                }
            }
        }
    }

    if let Some(existing_ui) = existing.get("ui").and_then(Value::as_object) {
        let incoming_ui = incoming_root.entry("ui").or_insert_with(|| json!({}));
        if !incoming_ui.is_object() {
            *incoming_ui = json!({});
        }
        if let Some(incoming_ui) = incoming_ui.as_object_mut() {
            for key in ["speciesChangedAt", "speciesVariantBySpecies"] {
                if let Some(value) = existing_ui.get(key) {
                    incoming_ui.insert(key.into(), value.clone());
                }
            }
        }
    }
}

fn merge_pet_memory_events(existing: &Value, incoming: Value) -> Value {
    let mut incoming_root = match incoming {
        Value::Object(map) => map,
        other => return other,
    };

    preserve_existing_hatched_lifecycle(existing, &mut incoming_root);
    preserve_newer_existing_appearance(existing, &mut incoming_root);

    let existing_events = existing
        .as_object()
        .and_then(|root| root.get("memory"))
        .and_then(Value::as_object)
        .and_then(|memory| memory.get("events"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if existing_events.is_empty() {
        return Value::Object(incoming_root);
    }

    let memory = incoming_root.entry("memory").or_insert_with(|| json!({}));
    if !memory.is_object() {
        *memory = json!({});
    }
    let memory_object = match memory.as_object_mut() {
        Some(memory_object) => memory_object,
        None => return Value::Object(incoming_root),
    };

    let incoming_events = memory_object
        .get("events")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut combined = Vec::with_capacity(incoming_events.len() + existing_events.len());
    combined.extend(incoming_events);
    combined.extend(existing_events);
    combined
        .sort_by(|left, right| event_memory_timestamp(right).cmp(&event_memory_timestamp(left)));

    let mut merged = Vec::with_capacity(combined.len());
    let mut seen_ids = HashSet::new();

    for event in combined {
        let event_id = event.get("id").and_then(Value::as_str).map(str::to_string);
        if let Some(event_id) = event_id {
            if seen_ids.contains(&event_id) {
                continue;
            }
            seen_ids.insert(event_id);
        }
        merged.push(event);
        if merged.len() >= 40 {
            break;
        }
    }

    memory_object.insert("events".into(), Value::Array(merged));
    Value::Object(incoming_root)
}

fn reconcile_pet_value(value: Value, now: DateTime<Utc>) -> Result<Value, String> {
    let mut root = match value {
        Value::Object(map) => map,
        _ => return Err("pet payload must be an object".into()),
    };

    if pet_tick_paused(&root, now) {
        return Ok(Value::Object(root));
    }

    let state_value = root
        .get("state")
        .cloned()
        .ok_or_else(|| "pet payload missing state".to_string())?;
    let mut state: PetStateSnapshot =
        serde_json::from_value(state_value).map_err(|error| error.to_string())?;
    let mut pet = PetEnvelope { state };
    reconcile_pet_state(&mut pet, now);
    state = pet.state;
    root.insert(
        "state".into(),
        serde_json::to_value(state).map_err(|error| error.to_string())?,
    );
    Ok(Value::Object(root))
}

fn build_walk_tick(
    app: &tauri::AppHandle,
    state: &mut WalkState,
) -> Result<Option<WalkTick>, String> {
    let now = Utc::now();
    if state
        .interrupted_until
        .map(|until| until > now)
        .unwrap_or(false)
    {
        return Ok(None);
    }

    if let Some(window) = app.get_webview_window("pet") {
        if let Ok(position) = window.outer_position() {
            state.x = position.x as f64;
        }
    }

    let (width, height) = monitor_size(app)?;
    let min_x = 32.0;
    let max_x = (width - PET_HIT_SIZE - 32.0).max(min_x);
    let floor_y = (height - PET_HIT_SIZE - 24.0).max(24.0);

    state.x += WALK_STEP_X * state.direction;
    if state.x <= min_x {
        state.x = min_x;
        state.direction = 1.0;
    } else if state.x >= max_x {
        state.x = max_x;
        state.direction = -1.0;
    }
    state.frame += 1;

    Ok(Some(WalkTick {
        x: state.x,
        y: floor_y,
        action: if state.frame % 18 < 14 {
            "walk"
        } else {
            "idle"
        }
        .into(),
        facing: if state.direction >= 0.0 {
            "right"
        } else {
            "left"
        }
        .into(),
        frame: state.frame,
    }))
}

fn ensure_reminder_scheduler(
    app: &tauri::AppHandle,
    state: &tauri::State<AppState>,
) -> Result<(), String> {
    let mut started = state
        .reminder_scheduler_started
        .lock()
        .map_err(|error| error.to_string())?;
    if *started {
        return Ok(());
    }
    *started = true;
    drop(started);

    let app_handle = app.clone();
    thread::spawn(move || loop {
        let _ = emit_due_reminders(&app_handle);
        thread::sleep(StdDuration::from_secs(5));
    });

    Ok(())
}

fn ensure_walk_scheduler(
    app: &tauri::AppHandle,
    state: &tauri::State<AppState>,
) -> Result<(), String> {
    let mut started = state
        .walk_scheduler_started
        .lock()
        .map_err(|error| error.to_string())?;
    if *started {
        return Ok(());
    }
    *started = true;
    drop(started);

    let app_handle = app.clone();
    thread::spawn(move || loop {
        let app_state = app_handle.state::<AppState>();
        if let Ok(mut walk_state) = app_state.walk_state.lock() {
            if let Ok(Some(tick)) = build_walk_tick(&app_handle, &mut walk_state) {
                let _ = app_handle.emit("walk-tick", tick);
            }
        }
        thread::sleep(StdDuration::from_millis(WALK_TICK_MS));
    });

    Ok(())
}

#[tauri::command]
fn load_pet(app: tauri::AppHandle) -> Result<Value, String> {
    let path = pet_path(&app)?;
    Ok(read_json(&path, Value::Null))
}

#[tauri::command]
fn load_pet_reconciled(app: tauri::AppHandle) -> Result<Value, String> {
    let path = pet_path(&app)?;
    let value = read_json(&path, Value::Null);
    if value.is_null() {
        return Ok(Value::Null);
    }

    let reconciled = reconcile_pet_value(value, Utc::now())?;
    write_json(&path, &reconciled)?;
    Ok(reconciled)
}

#[tauri::command]
fn save_pet(app: tauri::AppHandle, data: Value) -> Result<bool, String> {
    let path = pet_path(&app)?;
    let existing = read_json(&path, Value::Null);
    let merged = merge_pet_memory_events(&existing, data);
    write_json(&path, &merged)?;
    app.emit("pet-updated", merged)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

// Diary persistence: separate file from pet.json so a year of activity logs
// doesn't bloat the pet snapshot we re-serialise on every commit. The merge
// step enforces the append-only contract for sealed days -- once a date is
// sealed, subsequent saves can't rewrite its narrative or stats (only
// userNote is allowed to mutate).
#[tauri::command]
fn load_diary(app: tauri::AppHandle) -> Result<Value, String> {
    let path = diary_path(&app)?;
    Ok(read_json(&path, Value::Null))
}

#[tauri::command]
fn save_diary(app: tauri::AppHandle, data: Value) -> Result<Value, String> {
    let path = diary_path(&app)?;
    let existing = read_json(&path, Value::Null);
    let merged = merge_diary_value(&existing, data);
    write_json(&path, &merged)?;
    app.emit("diary-updated", merged.clone())
        .map_err(|error| error.to_string())?;
    Ok(merged)
}

// Activity sampler IPC. The Tauri side runs a background thread that polls
// user-idle every 60s and bumps a per-day counter; the JS side reads it on
// demand to fold into diary entries.
#[tauri::command]
fn set_activity_tracking(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<bool, String> {
    let app_state = state.inner();
    if enabled {
        ensure_activity_sampler(&app, app_state)?;
    } else if let Ok(mut flag) = app_state.activity_sampler_enabled.lock() {
        *flag = false;
    }
    Ok(enabled)
}

#[tauri::command]
fn get_active_minutes(app: tauri::AppHandle, date: String) -> Result<Value, String> {
    let log = read_activity_log(&app);
    let entry = log.get(date.as_str()).cloned().unwrap_or_else(|| {
        json!({
            "activeMinutes": -1,
            "firstActiveAt": Value::Null,
            "lastActiveAt": Value::Null,
            "fullDayCoverage": false,
        })
    });
    Ok(entry)
}

// Per-repo git stats for a single calendar day. We shell out to `git` rather
// than linking libgit2 because (a) the user already has git, (b) the output
// surface is small enough that string parsing is fine, and (c) we avoid a
// large native dep just for `git log --shortstat`.
#[tauri::command]
fn get_git_diary_stats(
    paths: Vec<String>,
    since_iso: String,
    until_iso: String,
) -> Result<Value, String> {
    let mut per_repo = Vec::with_capacity(paths.len());
    let mut total_commits: u64 = 0;
    let mut total_insertions: i64 = 0;
    let mut total_deletions: i64 = 0;

    for raw_path in paths.iter() {
        let path_str = raw_path.trim();
        if path_str.is_empty() {
            continue;
        }
        let stat = collect_repo_diary_stat(path_str, &since_iso, &until_iso);
        if stat.get("error").map(|v| v.is_null()).unwrap_or(true) {
            total_commits += stat.get("commits").and_then(|v| v.as_u64()).unwrap_or(0);
            total_insertions += stat.get("insertions").and_then(|v| v.as_i64()).unwrap_or(0);
            total_deletions += stat.get("deletions").and_then(|v| v.as_i64()).unwrap_or(0);
        }
        per_repo.push(stat);
    }

    Ok(json!({
        "totalCommits": total_commits,
        "totalInsertions": total_insertions,
        "totalDeletions": total_deletions,
        "perRepo": per_repo,
    }))
}

fn collect_repo_diary_stat(path: &str, since_iso: &str, until_iso: &str) -> Value {
    let dir = PathBuf::from(path);
    if !dir.exists() {
        return json!({
            "path": path,
            "commits": 0,
            "insertions": -1,
            "deletions": -1,
            "error": "path not found",
        });
    }
    if !dir.join(".git").exists() {
        // Submodule / worktree edge case: fall through and let `git` itself
        // tell us via its exit code, which is clearer than a heuristic.
    }

    // `git log --shortstat --no-merges` works on every modern git and gives
    // us both subjects and per-commit stats. We avoid `--numstat` to stay
    // single-pass and bounded.
    let output = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .arg("log")
        .arg("--no-merges")
        .arg("--shortstat")
        .arg("--date=iso8601-strict")
        .arg("--pretty=format:%H%x09%s")
        .arg(format!("--since={}", since_iso))
        .arg(format!("--until={}", until_iso))
        .stderr(Stdio::null())
        .output();

    let output = match output {
        Ok(o) => o,
        Err(err) => {
            return json!({
                "path": path,
                "commits": 0,
                "insertions": -1,
                "deletions": -1,
                "error": format!("git not runnable: {}", err),
            });
        }
    };

    if !output.status.success() {
        return json!({
            "path": path,
            "commits": 0,
            "insertions": -1,
            "deletions": -1,
            "error": format!("git exit {}", output.status),
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits: u64 = 0;
    let mut insertions: i64 = 0;
    let mut deletions: i64 = 0;
    let mut subjects: Vec<String> = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((_hash, subject)) = trimmed.split_once('\t') {
            commits += 1;
            subjects.push(subject.trim().to_string());
            continue;
        }
        // shortstat lines look like:
        //   3 files changed, 87 insertions(+), 12 deletions(-)
        for chunk in trimmed.split(',') {
            let chunk = chunk.trim();
            if chunk.contains("insertion") {
                if let Some(num) = chunk
                    .split_whitespace()
                    .next()
                    .and_then(|s| s.parse::<i64>().ok())
                {
                    insertions += num;
                }
            } else if chunk.contains("deletion") {
                if let Some(num) = chunk
                    .split_whitespace()
                    .next()
                    .and_then(|s| s.parse::<i64>().ok())
                {
                    deletions += num;
                }
            }
        }
    }

    let first_subject = subjects.last().cloned();
    let last_subject = subjects.first().cloned();

    json!({
        "path": path,
        "commits": commits,
        "insertions": insertions,
        "deletions": deletions,
        "firstSubject": first_subject,
        "lastSubject": last_subject,
        "error": Value::Null,
    })
}

// Merge two diary ledger snapshots. Sealed entries on disk always win; the
// caller (JS side) is expected to refuse to mutate sealed days but we
// double-enforce here so a buggy renderer can't corrupt history.
fn merge_diary_value(existing: &Value, incoming: Value) -> Value {
    let existing_entries = existing
        .get("entries")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_else(Map::new);

    let mut merged = if let Value::Object(obj) = incoming.clone() {
        obj
    } else {
        return incoming;
    };

    let incoming_entries = merged
        .get("entries")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_else(Map::new);

    let mut entries_out: Map<String, Value> = Map::new();

    // Carry over every existing entry first; sealed ones lock their stats.
    for (date, existing_entry) in existing_entries.iter() {
        let sealed = existing_entry
            .get("sealed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !sealed {
            entries_out.insert(date.clone(), existing_entry.clone());
            continue;
        }
        // Sealed: merge in only the userNote field from incoming if any,
        // dropping every other field on the floor.
        let incoming_note = incoming_entries
            .get(date)
            .and_then(|entry| entry.get("userNote"))
            .cloned();
        let mut sealed_entry = existing_entry.clone();
        if let (Some(note), Value::Object(ref mut sealed_map)) = (incoming_note, &mut sealed_entry)
        {
            sealed_map.insert("userNote".into(), note);
        }
        entries_out.insert(date.clone(), sealed_entry);
    }

    // Apply incoming entries that weren't sealed already.
    for (date, incoming_entry) in incoming_entries.into_iter() {
        let was_sealed = existing_entries
            .get(&date)
            .and_then(|entry| entry.get("sealed"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if was_sealed {
            // Already handled in the loop above (sealed-wins path).
            continue;
        }
        entries_out.insert(date, incoming_entry);
    }

    merged.insert("entries".into(), Value::Object(entries_out));
    Value::Object(merged)
}

fn read_activity_log(app: &tauri::AppHandle) -> Map<String, Value> {
    let path = match activity_path(app) {
        Ok(p) => p,
        Err(_) => return Map::new(),
    };
    let value = read_json(&path, Value::Null);
    value.as_object().cloned().unwrap_or_else(Map::new)
}

fn write_activity_log(app: &tauri::AppHandle, log: &Map<String, Value>) -> Result<(), String> {
    let path = activity_path(app)?;
    write_json(&path, &Value::Object(log.clone()))
}

// Idle-counter sampler. Spawns once per process; rechecks every 60s. When the
// user is "active" (idle counter < 90s, leaving headroom for sampling jitter)
// we tick the current day's minute counter. firstActiveAt/lastActiveAt let
// the diary narrative say "you started early" without exposing exact times
// the user might consider sensitive.
const ACTIVITY_SAMPLE_INTERVAL_SECS: u64 = 60;
const ACTIVITY_ACTIVE_THRESHOLD_SECS: u64 = 90;

fn ensure_activity_sampler(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    {
        let mut enabled = state
            .activity_sampler_enabled
            .lock()
            .map_err(|e| e.to_string())?;
        *enabled = true;
    }

    let mut started = state
        .activity_sampler_started
        .lock()
        .map_err(|e| e.to_string())?;
    if *started {
        return Ok(());
    }
    *started = true;

    let app_handle = app.clone();
    let enabled_flag = state.activity_sampler_enabled.clone_arc_for_thread();

    thread::spawn(move || loop {
        if !enabled_flag.lock().map(|f| *f).unwrap_or(false) {
            // Park briefly even when disabled so that a future re-enable can
            // resume without restarting the thread.
            thread::sleep(StdDuration::from_secs(ACTIVITY_SAMPLE_INTERVAL_SECS));
            continue;
        }

        let idle_seconds = match user_idle::UserIdle::get_time() {
            Ok(idle) => idle.as_seconds(),
            Err(_) => {
                thread::sleep(StdDuration::from_secs(ACTIVITY_SAMPLE_INTERVAL_SECS));
                continue;
            }
        };

        if idle_seconds <= ACTIVITY_ACTIVE_THRESHOLD_SECS {
            // Capture date in local time so "today" matches the user's wall
            // clock. We deliberately skip timezone-history bookkeeping for
            // Phase 0 -- a DST jump just shows up as one weird day.
            let now = chrono::Local::now();
            let date = now.format("%Y-%m-%d").to_string();
            let hhmm = now.format("%H:%M").to_string();
            let mut log = read_activity_log(&app_handle);
            let entry = log.entry(date.clone()).or_insert_with(|| {
                json!({
                    "activeMinutes": 0,
                    "firstActiveAt": Value::Null,
                    "lastActiveAt": Value::Null,
                    "fullDayCoverage": false,
                })
            });
            if let Value::Object(map) = entry {
                let prev = map
                    .get("activeMinutes")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                map.insert("activeMinutes".into(), json!(prev + 1));
                if map
                    .get("firstActiveAt")
                    .map(|v| v.is_null())
                    .unwrap_or(true)
                {
                    map.insert("firstActiveAt".into(), json!(hhmm.clone()));
                }
                map.insert("lastActiveAt".into(), json!(hhmm));
            }
            // Best-effort persist; failure here just means the next sample
            // will try again. Avoid bubbling the error up because the
            // sampler thread can't recover from a returned Err anyway.
            let _ = write_activity_log(&app_handle, &log);
        }

        thread::sleep(StdDuration::from_secs(ACTIVITY_SAMPLE_INTERVAL_SECS));
    });

    Ok(())
}

#[tauri::command]
fn load_domain_state(app: tauri::AppHandle, key: String) -> Result<Value, String> {
    if !valid_domain_key(&key) {
        return Err("invalid domain key".into());
    }

    let path = domain_path(&app, &key)?;
    Ok(normalize_domain_envelope(
        &key,
        read_json(&path, default_domain_envelope(&key)),
    ))
}

#[tauri::command]
fn save_domain_state(app: tauri::AppHandle, key: String, data: Value) -> Result<Value, String> {
    if !valid_domain_key(&key) {
        return Err("invalid domain key".into());
    }

    let path = domain_path(&app, &key)?;
    let normalized = normalize_domain_envelope(&key, data);
    write_json(&path, &normalized)?;
    app.emit(
        "domain-state-updated",
        json!({
          "key": key,
          "envelope": normalized.clone()
        }),
    )
    .map_err(|error| error.to_string())?;
    Ok(normalized)
}

#[tauri::command]
fn load_reminders(app: tauri::AppHandle) -> Result<Vec<ReminderItem>, String> {
    load_reminder_state(&app)
}

#[tauri::command]
fn create_reminder(app: tauri::AppHandle, input: ReminderInput) -> Result<ReminderItem, String> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err("title required".into());
    }
    if parse_datetime(&input.scheduled_at).is_none() {
        return Err("invalid scheduled_at".into());
    }

    let mut reminders = load_reminder_state(&app)?;
    let reminder = ReminderItem {
        id: format!("reminder-{}", Utc::now().timestamp_millis()),
        title,
        scheduled_at: input.scheduled_at,
        created_at: now_iso(),
        status: "pending".into(),
        snooze_until: None,
        intensity: Some(normalize_reminder_intensity(input.intensity.as_deref())),
    };
    reminders.push(reminder.clone());
    reminders.sort_by_key(reminder_sort_key);
    save_reminder_state(&app, &reminders)?;
    Ok(reminder)
}

#[tauri::command]
fn complete_reminder(app: tauri::AppHandle, id: String) -> Result<bool, String> {
    let mut reminders = load_reminder_state(&app)?;
    let mut changed = false;

    for reminder in reminders.iter_mut() {
        if reminder.id == id {
            reminder.status = "done".into();
            reminder.snooze_until = None;
            changed = true;
        }
    }

    if changed {
        save_reminder_state(&app, &reminders)?;
    }

    Ok(changed)
}

#[tauri::command]
fn snooze_reminder(
    app: tauri::AppHandle,
    id: String,
    minutes: i64,
) -> Result<Option<ReminderItem>, String> {
    let mut reminders = load_reminder_state(&app)?;
    let mut updated: Option<ReminderItem> = None;
    let snooze_minutes = minutes.max(1);
    let snooze_until = (Utc::now() + ChronoDuration::minutes(snooze_minutes)).to_rfc3339();

    for reminder in reminders.iter_mut() {
        if reminder.id == id {
            reminder.status = "pending".into();
            reminder.snooze_until = Some(snooze_until.clone());
            updated = Some(reminder.clone());
        }
    }

    if updated.is_some() {
        reminders.sort_by_key(reminder_sort_key);
        save_reminder_state(&app, &reminders)?;
    }

    Ok(updated)
}

#[tauri::command]
fn consume_due_reminders(app: tauri::AppHandle) -> Result<Vec<ReminderItem>, String> {
    let mut reminders = load_reminder_state(&app)?;
    let now = Utc::now();
    let mut triggered = Vec::new();
    let mut changed = false;

    for reminder in reminders.iter_mut() {
        if reminder.status != "pending" {
            continue;
        }

        let Some(trigger_at) = parse_datetime(active_reminder_time(reminder)) else {
            continue;
        };

        if trigger_at > now {
            continue;
        }

        reminder.status = "missed".into();
        reminder.snooze_until = None;
        triggered.push(reminder.clone());
        changed = true;
    }

    if changed {
        reminders.sort_by_key(reminder_sort_key);
        save_reminder_state(&app, &reminders)?;
    }

    Ok(triggered)
}

fn emit_due_reminders(app: &tauri::AppHandle) -> Result<Vec<ReminderItem>, String> {
    let triggered = consume_due_reminders(app.clone())?;
    for reminder in &triggered {
        app.emit("reminder-trigger", reminder.clone())
            .map_err(|error| error.to_string())?;
    }
    Ok(triggered)
}

#[tauri::command]
fn write_calendar_event(
    app: tauri::AppHandle,
    input: CalendarEventWriteInput,
) -> Result<CalendarEventWriteResult, String> {
    if input.title.trim().is_empty() {
        return Err("title required".into());
    }
    if parse_datetime(&input.starts_at).is_none() {
        return Err("invalid starts_at".into());
    }
    if input
        .ends_at
        .as_deref()
        .is_some_and(|value| parse_datetime(value).is_none())
    {
        return Err("invalid ends_at".into());
    }

    write_calendar_event_file(&app, &input)
}

#[tauri::command]
fn emit_coding_event(
    app: tauri::AppHandle,
    event: CodingEvent,
) -> Result<CodingEventIngestResult, String> {
    let normalized = normalize_coding_event(event)?;
    persist_coding_event_side_effects(&app, &normalized)?;
    emit_coding_event_to_windows(&app, &normalized)?;
    Ok(CodingEventIngestResult {
        accepted: true,
        event: normalized,
    })
}

#[tauri::command]
fn load_model_config(app: tauri::AppHandle) -> Result<ModelConfig, String> {
    let path = model_path(&app)?;
    serde_json::from_value(read_json(
        &path,
        serde_json::to_value(default_model_config()).map_err(|error| error.to_string())?,
    ))
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_model_config(app: tauri::AppHandle, config: ModelConfig) -> Result<ModelConfig, String> {
    let path = model_path(&app)?;
    write_json(
        &path,
        &serde_json::to_value(&config).map_err(|error| error.to_string())?,
    )?;
    Ok(config)
}

#[tauri::command]
fn save_share_card(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    prefix: Option<String>,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty share card payload".to_string());
    }
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    // The prefix is used to distinguish e.g. growth cards ("growth-card-") from
    // the manual export ("share-card-"). Anything other than [a-zA-Z0-9-_] gets
    // squashed so a malformed caller can't write outside the exports/ folder.
    let safe_prefix = prefix
        .as_deref()
        .map(|raw| {
            raw.chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
                .collect::<String>()
        })
        .filter(|sanitised| !sanitised.is_empty())
        .unwrap_or_else(|| "share-card-".to_string());
    let normalised_prefix = if safe_prefix.ends_with('-') || safe_prefix.ends_with('_') {
        safe_prefix
    } else {
        format!("{}-", safe_prefix)
    };
    let file_name = format!("{}{}.png", normalised_prefix, timestamp);
    let path = export_path(&app, &file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    path.to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| "failed to encode share card path".to_string())
}

// Single-file dump used by the panel "导出全部到磁盘" button. Caller decides
// the JSON shape (pet + domains + diary) and we just stream it onto disk.
// We deliberately keep the path in the standard exports/ dir so the user
// can right-click reveal it the same way they already do for share cards.
#[tauri::command]
fn write_pet_snapshot(app: tauri::AppHandle, payload: String) -> Result<serde_json::Value, String> {
    if payload.is_empty() {
        return Err("empty snapshot payload".to_string());
    }
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let file_name = format!("aievopet-snapshot-{}.json", timestamp);
    let path = export_path(&app, &file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, payload.as_bytes()).map_err(|error| error.to_string())?;
    let path_str = path
        .to_str()
        .ok_or_else(|| "failed to encode snapshot path".to_string())?
        .to_string();
    Ok(serde_json::json!({ "filePath": path_str }))
}

fn is_safe_pet_manifest_id(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return false;
    }
    let len = value.len();
    len >= 2
        && len <= 64
        && value.chars().all(|ch| {
            ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '.' || ch == '_' || ch == '-'
        })
}

fn safe_relative_pet_asset_path(value: &str) -> Option<PathBuf> {
    if value.trim() != value || value.is_empty() || value.contains(':') {
        return None;
    }
    let path = Path::new(value);
    if path.is_absolute() {
        return None;
    }
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            _ => return None,
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn image_mime_for_path(path: &Path) -> Option<&'static str> {
    pet_image_extension(path).map(|extension| match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => unreachable!(),
    })
}

fn pet_image_extension(path: &Path) -> Option<String> {
    match path
        .extension()
        .and_then(|os| os.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("png".into()),
        Some("jpg") | Some("jpeg") => Some("jpg".into()),
        Some("webp") => Some("webp".into()),
        _ => None,
    }
}

fn pet_image_magic_matches(extension: &str, bytes: &[u8]) -> bool {
    match extension {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G']),
        "jpg" | "jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

fn pet_asset_data_url(path: &Path) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let mime = image_mime_for_path(path).ok_or_else(|| "unsupported image type".to_string())?;
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    if metadata.len() > USER_PET_IMAGE_MAX_BYTES {
        return Err("image is larger than 4 MB".into());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}

fn localized_pet_name(name: &Value) -> (String, Option<String>) {
    if let Some(value) = name
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return (value.chars().take(40).collect(), None);
    }
    let zh = name
        .get("zh-CN")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Imported pet")
        .chars()
        .take(40)
        .collect::<String>();
    let en = name
        .get("en-US")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(40).collect::<String>());
    (zh, en)
}

fn clamp_i64(value: i64, min: i64, max: i64) -> i64 {
    value.max(min).min(max)
}

fn normalize_pet_placement(
    mut placement: PetCutoutPlacementPayload,
    fallback_id: &str,
    index: usize,
) -> PetCutoutPlacementPayload {
    if placement.id.trim().is_empty() {
        placement.id = fallback_id.to_string();
    }
    if placement
        .slot_id
        .as_deref()
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        placement.slot_id = Some(placement.id.clone());
    }
    placement.x = clamp_i64(placement.x, 0, 2559);
    placement.y = clamp_i64(placement.y, 0, 2559);
    placement.width = clamp_i64(placement.width, 24, 2560);
    placement.height = clamp_i64(placement.height, 24, 2560);
    placement.z_index = clamp_i64(placement.z_index, -100, 100).max(index as i64 + 1);
    placement
}

fn normalize_user_pet_package(
    package_dir: &Path,
    manifest: UserPetManifest,
) -> Result<ImportedPetPackagePayload, String> {
    if manifest.format != "aievopet.petdex.v1" {
        return Err("unsupported pet package format".into());
    }
    if !is_safe_pet_manifest_id(&manifest.id) {
        return Err("unsafe pet package id".into());
    }

    let (label, label_en) = localized_pet_name(&manifest.name);
    let mut stages = HashMap::new();
    for (stage_key, stage) in manifest.stages {
        if !matches!(
            stage_key.as_str(),
            "egg" | "baby" | "child" | "adult" | "elder"
        ) {
            continue;
        }
        if stage.renderer != "cutout"
            || stage.parts.is_empty()
            || stage.parts.len() > USER_PET_MAX_PARTS_PER_STAGE
        {
            continue;
        }
        let mut parts = Vec::new();
        for (index, part) in stage.parts.into_iter().enumerate() {
            let relative_path = safe_relative_pet_asset_path(&part.image)
                .ok_or_else(|| "unsafe pet image path".to_string())?;
            let image_path = package_dir.join(relative_path);
            let image_src = pet_asset_data_url(&image_path)?;
            let id = if part.id.trim().is_empty() {
                format!("part-{}", index + 1)
            } else {
                part.id.trim().chars().take(40).collect::<String>()
            };
            let slot_id = part
                .slot_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.chars().take(40).collect::<String>())
                .unwrap_or_else(|| id.clone());
            let label = part
                .label
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.chars().take(40).collect::<String>())
                .unwrap_or_else(|| id.clone());
            let motion_role = match part.motion_role.as_deref() {
                Some("ears") => "ears",
                Some("eyes") => "eyes",
                Some("snout") => "snout",
                Some("cheeks") => "cheeks",
                _ => "none",
            }
            .to_string();
            parts.push(PetCutoutPartPayload {
                id: id.clone(),
                slot_id,
                label,
                image_src,
                motion_role,
                default_placement: normalize_pet_placement(part.default_placement, &id, index),
            });
        }
        if !parts.is_empty() {
            stages.insert(
                stage_key,
                ImportedPetPackageStagePayload {
                    renderer: "cutout".into(),
                    parts,
                },
            );
        }
    }

    if !(stages.contains_key("baby")
        || stages.contains_key("child")
        || stages.contains_key("adult")
        || stages.contains_key("elder"))
    {
        return Err("pet package needs at least one hatched stage".into());
    }

    Ok(ImportedPetPackagePayload {
        species_id: format!("petdex:{}", manifest.id),
        manifest_id: manifest.id,
        version: manifest.version.filter(|value| !value.trim().is_empty()),
        label,
        label_en,
        author: manifest.author.filter(|value| !value.trim().is_empty()),
        license: manifest.license.filter(|value| !value.trim().is_empty()),
        stages,
    })
}

fn load_user_pet_package(package_dir: &Path) -> Result<ImportedPetPackagePayload, String> {
    let manifest_path = package_dir.join("manifest.json");
    let content = fs::read_to_string(&manifest_path).map_err(|error| error.to_string())?;
    let manifest: UserPetManifest =
        serde_json::from_str(&content).map_err(|error| error.to_string())?;
    normalize_user_pet_package(package_dir, manifest)
}

fn safe_user_pet_id_fragment(value: &str) -> String {
    let mut out = String::new();
    let mut last_was_dash = false;
    for ch in value.trim().to_ascii_lowercase().chars() {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() {
            out.push(ch);
            last_was_dash = false;
        } else if !last_was_dash && !out.is_empty() {
            out.push('-');
            last_was_dash = true;
        }
        if out.len() >= 24 {
            break;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "pet".into()
    } else {
        out
    }
}

fn create_user_pet_package_from_image_dir(
    pets_dir: &Path,
    input: CreateUserPetFromImageInput,
) -> Result<ImportedPetPackagePayload, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let display_name = input.name.trim().chars().take(40).collect::<String>();
    if display_name.is_empty() {
        return Err("pet name is required".into());
    }

    let source_path = Path::new(input.file_name.trim());
    let extension =
        pet_image_extension(source_path).ok_or_else(|| "unsupported image type".to_string())?;
    let encoded = input
        .image_base64
        .trim()
        .rsplit_once(',')
        .map(|(_, value)| value)
        .unwrap_or_else(|| input.image_base64.trim());
    let max_encoded_len = ((USER_PET_IMAGE_MAX_BYTES + 2) / 3 * 4 + 16) as usize;
    if encoded.len() > max_encoded_len {
        return Err("image is larger than 4 MB".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "invalid image data".to_string())?;
    if bytes.len() as u64 > USER_PET_IMAGE_MAX_BYTES {
        return Err("image is larger than 4 MB".into());
    }
    if !pet_image_magic_matches(&extension, &bytes) {
        return Err("image file type does not match its extension".into());
    }

    fs::create_dir_all(pets_dir).map_err(|error| error.to_string())?;
    let source_stem = source_path
        .file_stem()
        .and_then(|os| os.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(display_name.as_str());
    let safe_stem = safe_user_pet_id_fragment(source_stem);
    let timestamp = Utc::now().timestamp_millis();
    let mut manifest_id = format!("image-{}-{}", safe_stem, timestamp);
    if manifest_id.len() > 64 {
        manifest_id.truncate(64);
        while manifest_id.ends_with('-') || manifest_id.ends_with('.') || manifest_id.ends_with('_')
        {
            manifest_id.pop();
        }
    }
    if !is_safe_pet_manifest_id(&manifest_id) {
        manifest_id = format!("image-pet-{}", timestamp);
    }
    let mut package_dir = pets_dir.join(&manifest_id);
    let mut attempt = 2;
    while package_dir.exists() {
        let suffix = format!("-{}", attempt);
        let base_len = 64_usize.saturating_sub(suffix.len());
        let mut next_id = manifest_id.chars().take(base_len).collect::<String>();
        while next_id.ends_with('-') || next_id.ends_with('.') || next_id.ends_with('_') {
            next_id.pop();
        }
        next_id.push_str(&suffix);
        manifest_id = next_id;
        package_dir = pets_dir.join(&manifest_id);
        attempt += 1;
    }

    fs::create_dir_all(&package_dir).map_err(|error| error.to_string())?;
    let image_name = format!("body.{}", extension);
    fs::write(package_dir.join(&image_name), &bytes).map_err(|error| error.to_string())?;

    let placement = json!({
        "id": "body",
        "slotId": "body",
        "x": 350,
        "y": 438,
        "width": 1850,
        "height": 1850,
        "zIndex": 2,
        "visible": true
    });
    let part = json!({
        "id": "body",
        "slotId": "body",
        "label": "Body",
        "image": image_name,
        "motionRole": "none",
        "defaultPlacement": placement
    });
    let stage = json!({
        "renderer": "cutout",
        "parts": [part]
    });
    let manifest = json!({
        "format": "aievopet.petdex.v1",
        "id": manifest_id,
        "version": "1.0.0",
        "name": {
            "zh-CN": display_name,
            "en-US": display_name
        },
        "author": "local user",
        "license": "User-provided local asset",
        "stages": {
            "baby": stage.clone(),
            "child": stage.clone(),
            "adult": stage.clone(),
            "elder": stage
        }
    });
    let manifest_json =
        serde_json::to_string_pretty(&manifest).map_err(|error| error.to_string())?;
    fs::write(package_dir.join("manifest.json"), manifest_json)
        .map_err(|error| error.to_string())?;

    load_user_pet_package(&package_dir)
}

#[tauri::command]
fn create_user_pet_from_image(
    app: tauri::AppHandle,
    input: CreateUserPetFromImageInput,
) -> Result<ImportedPetPackagePayload, String> {
    let dir = user_pet_dir(&app)?;
    create_user_pet_package_from_image_dir(&dir, input)
}

// A6: scan <data_dir>/wardrobe/ for user-supplied PNGs and return them as
// data URLs keyed by item id (filename without .png extension). The
// renderer overrides bundled assetUrls with whatever this returns, giving
// users a no-rebuild path to swap in their own art.
//
// Why data URLs instead of file paths: Tauri 2's webview can't directly
// reference paths outside the app bundle without setting up the asset
// protocol — which adds CSP / security surface for a feature that only
// touches a handful of small PNGs. Data URLs are slower in theory but
// fine for ~50 files at < 100KB each, and they keep the renderer's image
// loading code identical to the bundled path.
#[tauri::command]
fn list_user_pet_packages(app: tauri::AppHandle) -> Result<Vec<ImportedPetPackagePayload>, String> {
    let dir = user_pet_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(&dir).map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Ok(package) = load_user_pet_package(&path) {
            out.push(package);
        }
    }
    out.sort_by(|left, right| left.label.cmp(&right.label));
    Ok(out)
}

#[tauri::command]
fn open_user_pet_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = user_pet_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path_string = dir.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(path_string);
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(path_string);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(path_string);
    }

    #[allow(unreachable_code)]
    Ok(path_string)
}

#[tauri::command]
fn list_user_wardrobe_assets(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let dir = user_wardrobe_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(&dir).map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|os| os.to_str())
            .map(|s| s.to_ascii_lowercase());
        let mime = match extension.as_deref() {
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("webp") => "image/webp",
            Some("svg") => "image/svg+xml",
            _ => continue,
        };
        let stem = match path.file_stem().and_then(|os| os.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        // Refuse anything obviously oversized (over 4 MB) so a stray bad
        // file can't silently bloat the in-memory map. Users will see
        // their image missing rather than a crash; we surface this via
        // the empty entry — a future polish pass could log per-file
        // skips, but keeping the API a flat Vec avoids extra plumbing.
        let metadata = match path.metadata() {
            Ok(m) if m.len() <= 4 * 1024 * 1024 => m,
            _ => continue,
        };
        let _ = metadata; // silence unused warning if metadata gating changes
        let bytes = match fs::read(&path) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let encoded = STANDARD.encode(&bytes);
        out.push((stem, format!("data:{};base64,{}", mime, encoded)));
    }
    Ok(out)
}

// Open Finder/Explorer at the wardrobe dir so the user can drop PNGs in
// without hunting for the path. Creates the dir on demand — first-run
// friendliness.
#[tauri::command]
fn open_user_wardrobe_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = user_wardrobe_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path_string = dir.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(path_string);
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(path_string);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(path_string);
    }
    #[allow(unreachable_code)]
    Ok(path_string)
}

#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<bool, String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("file not found: {}", path));
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&target)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", target.display()))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = target.parent().unwrap_or(&target);
        Command::new("xdg-open")
            .arg(parent)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }
    #[allow(unreachable_code)]
    Err("file manager reveal not supported on this platform".to_string())
}

#[tauri::command]
fn set_window_position(app: tauri::AppHandle, position: WindowPosition) -> Result<bool, String> {
    let window = app
        .get_webview_window("panel")
        .ok_or("panel window missing")?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(
            position.x, position.y,
        )))
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn set_dock_hover(app: tauri::AppHandle, hovering: bool) -> Result<bool, String> {
    let action = if hovering {
        "edgeReveal"
    } else {
        "edgeCollapse"
    };
    app.emit("tray-action", action)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn set_panel_open(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    open: bool,
) -> Result<bool, String> {
    let window = app
        .get_webview_window("panel")
        .ok_or("panel window missing")?;
    *state.panel_open.lock().map_err(|error| error.to_string())? = open;
    if open {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    } else {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
fn set_pet_hit_region(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    region: PetHitRegion,
) -> Result<bool, String> {
    *state
        .pet_hit_region
        .lock()
        .map_err(|error| error.to_string())? = Some(region.clone());
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.set_ignore_cursor_events(region.w <= 1.0 || region.h <= 1.0);
    }
    app.emit("pet-hit-region-updated", region)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn set_pet_window_bounds(app: tauri::AppHandle, bounds: PetWindowBounds) -> Result<bool, String> {
    let window = app.get_webview_window("pet").ok_or("pet window missing")?;
    window
        .set_position(Position::Logical(LogicalPosition::new(
            bounds.x as f64,
            bounds.y as f64,
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::Size::Logical(LogicalSize::new(
            bounds.width.max(1) as f64,
            bounds.height.max(1) as f64,
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(bounds.width <= 1 || bounds.height <= 1)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn interrupt_walk(state: tauri::State<AppState>) -> Result<bool, String> {
    let mut walk_state = state.walk_state.lock().map_err(|error| error.to_string())?;
    walk_state.interrupted_until =
        Some(Utc::now() + ChronoDuration::seconds(WALK_INTERRUPT_SECONDS));
    Ok(true)
}

fn bring_pet_to_active_monitor_now(
    app: &tauri::AppHandle,
    reason: &str,
    event: Option<CodingEvent>,
) -> Result<bool, String> {
    let window = app.get_webview_window("pet").ok_or("pet window missing")?;
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let cursor_position = app.cursor_position().ok().map(|cursor| (cursor.x, cursor.y));
    let frontmost_position = if event.is_some() { frontmost_window_center_position() } else { None };
    let target_position = frontmost_position.or(cursor_position);

    let target_monitor = target_position
        .as_ref()
        .and_then(|(x, y)| {
            monitors.iter().find(|monitor| {
                let mp = monitor.position();
                let ms = monitor.size();
                let right = mp.x + ms.width as i32;
                let bottom = mp.y + ms.height as i32;
                *x >= mp.x as f64
                    && *x < right as f64
                    && *y >= mp.y as f64
                    && *y < bottom as f64
            })
        })
        .or_else(|| {
            app.primary_monitor()
                .ok()
                .flatten()
                .as_ref()
                .and_then(|primary| {
                    let pp = primary.position();
                    let ps = primary.size();
                    monitors
                        .iter()
                        .find(|monitor| monitor.position() == pp && monitor.size() == ps)
                })
        })
        .or_else(|| monitors.first())
        .ok_or("no monitors available")?;

    let mp = target_monitor.position();
    let ms = target_monitor.size();
    let pet_x = mp.x + ((ms.width as i32 - PET_HIT_SIZE as i32) / 2).max(24);
    let pet_y = mp.y + ((ms.height as i32 - PET_HIT_SIZE as i32) / 2).max(24);

    if event.is_some() {
        if let Ok(mut walk_state) = app.state::<AppState>().walk_state.lock() {
            walk_state.x = pet_x as f64;
            walk_state.interrupted_until = Some(Utc::now() + ChronoDuration::seconds(CODING_PRESENTATION_HOLD_SECONDS));
        }
    }

    let _ = window.set_visible_on_all_workspaces(true);
    let _ = window.unminimize();
    window
        .set_position(Position::Physical(PhysicalPosition::new(pet_x, pet_y)))
        .map_err(|error| error.to_string())?;
    let _ = window.set_always_on_top(true);
    apply_pet_window_macos_overlay_behavior(&window);
    let _ = window.show();
    order_pet_window_front(&window);
    let _ = app.emit(
        "pet-window-teleported",
        PetWindowTeleported {
            x: pet_x,
            y: pet_y,
            reason: reason.to_string(),
            title: event.as_ref().map(|event| event.title.clone()),
            summary: event.as_ref().and_then(|event| event.summary.clone()),
            display_text: event.as_ref().map(coding_event_display_text),
            source: event.as_ref().map(|event| event.source.clone()),
        },
    );

    Ok(true)
}

fn bring_pet_to_active_monitor_with_reason(
    app: &tauri::AppHandle,
    reason: &str,
) -> Result<bool, String> {
    let app_handle = app.clone();
    let reason = reason.to_string();
    app.run_on_main_thread(move || {
        let _ = bring_pet_to_active_monitor_now(&app_handle, &reason, None);
    })
    .map_err(|error| error.to_string())?;
    Ok(true)
}

fn bring_pet_to_active_monitor_for_event(
    app: &tauri::AppHandle,
    event: &CodingEvent,
) -> Result<bool, String> {
    let app_handle = app.clone();
    let event = event.clone();
    app.run_on_main_thread(move || {
        let reason = event.kind.clone();
        let _ = bring_pet_to_active_monitor_now(&app_handle, &reason, Some(event));
    })
    .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn bring_pet_to_active_monitor(app: tauri::AppHandle) -> Result<bool, String> {
    bring_pet_to_active_monitor_with_reason(&app, "manual")
}

// Silent OS notification for high-importance coding events. Stays off
// the tauri-plugin-notification path on purpose:
//   - zero new dependencies / capability files,
//   - no permission prompt on first launch,
//   - macOS `display notification` is silent by default unless we add a
//     `with sound name` clause, which matches the "永远静音" preference
//     the user picked.
// Cross-platform best-effort: macOS uses osascript, Linux falls back to
// notify-send, Windows uses a tiny WinRT toast via PowerShell. Failures
// are swallowed because a missed notification shouldn't crash the
// coding-event pipeline.
#[tauri::command]
fn notify_user_strong(_app: tauri::AppHandle, title: String, body: String) -> Result<bool, String> {
    let title = title.trim().to_string();
    let body = body.trim().to_string();
    if title.is_empty() && body.is_empty() {
        return Ok(false);
    }

    #[cfg(target_os = "macos")]
    {
        let escape = |value: &str| {
            value
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', " ")
        };
        let safe_title = escape(&title);
        let safe_body = escape(&body);
        let script = if safe_body.is_empty() {
            format!(
                "display notification \"{}\" with title \"AIEvoPet\"",
                safe_title
            )
        } else {
            format!(
                "display notification \"{}\" with title \"{}\"",
                safe_body, safe_title
            )
        };
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        return Ok(true);
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("notify-send")
            .arg("--urgency=normal")
            .arg(if title.is_empty() {
                "AIEvoPet"
            } else {
                title.as_str()
            })
            .arg(body.as_str())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        return Ok(true);
    }

    #[cfg(target_os = "windows")]
    {
        let escape = |value: &str| {
            value
                .replace('\'', "''")
                .replace('<', "&lt;")
                .replace('>', "&gt;")
                .replace('&', "&amp;")
                .replace('\n', " ")
        };
        let safe_title = escape(if title.is_empty() {
            "AIEvoPet"
        } else {
            title.as_str()
        });
        let safe_body = escape(&body);
        let script = format!(
            "[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null;\
             $template='<toast><visual><binding template=\"ToastText02\"><text id=\"1\">{}</text><text id=\"2\">{}</text></binding></visual></toast>';\
             $xml=New-Object Windows.Data.Xml.Dom.XmlDocument; $xml.LoadXml($template);\
             $toast=New-Object Windows.UI.Notifications.ToastNotification($xml);\
             [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AIEvoPet').Show($toast)",
            safe_title, safe_body
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        return Ok(true);
    }

    #[allow(unreachable_code)]
    Ok(false)
}

fn pet_window_url() -> WebviewUrl {
    WebviewUrl::App("index.html?window=pet".into())
}

fn panel_window_url() -> WebviewUrl {
    WebviewUrl::App("index.html?window=panel".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_pet_package_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "aievopet-{}-{}-{}",
            name,
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&dir).expect("temp pet package dir");
        dir
    }

    fn write_pet_package_manifest(dir: &Path, id: &str, image_path: &str, stage_key: &str) {
        fs::write(
            dir.join("manifest.json"),
            format!(
                r#"{{
          "format": "aievopet.petdex.v1",
          "id": "{}",
          "version": "1.0.0",
          "name": {{ "zh-CN": "月亮猫", "en-US": "Moon Cat" }},
          "stages": {{
            "{}": {{
              "renderer": "cutout",
              "parts": [{{
                "id": "body",
                "slotId": "body",
                "label": "Body",
                "image": "{}",
                "motionRole": "none",
                "defaultPlacement": {{
                  "id": "body",
                  "slotId": "body",
                  "x": 250,
                  "y": 360,
                  "width": 512,
                  "height": 512,
                  "zIndex": 2,
                  "visible": true
                }}
              }}]
            }}
          }}
        }}"#,
                id, stage_key, image_path
            ),
        )
        .expect("manifest");
    }

    fn write_valid_pet_package(dir: &Path, image_path: &str) {
        if let Some(parent) = Path::new(image_path)
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            fs::create_dir_all(dir.join(parent)).expect("image parent dir");
        }
        fs::write(dir.join(image_path), [0_u8, 1, 2, 3]).expect("image bytes");
        write_pet_package_manifest(dir, "moon-cat", image_path, "baby");
    }

    #[test]
    fn load_user_pet_package_returns_imported_payload() {
        let dir = temp_pet_package_dir("valid-pet-package");
        write_valid_pet_package(&dir, "baby.png");

        let package = load_user_pet_package(&dir).expect("valid package");
        let stage = package.stages.get("baby").expect("baby stage");
        let part = stage.parts.first().expect("body part");

        assert_eq!(package.species_id, "petdex:moon-cat");
        assert_eq!(package.manifest_id, "moon-cat");
        assert_eq!(package.label, "月亮猫");
        assert_eq!(package.label_en.as_deref(), Some("Moon Cat"));
        assert_eq!(stage.renderer, "cutout");
        assert_eq!(part.id, "body");
        assert!(part.image_src.starts_with("data:image/png;base64,"));

        fs::remove_dir_all(dir).expect("cleanup pet package dir");
    }

    #[test]
    fn load_user_pet_package_rejects_unsafe_manifest_id() {
        let dir = temp_pet_package_dir("unsafe-id");
        fs::write(dir.join("baby.png"), [0_u8]).expect("image bytes");
        write_pet_package_manifest(&dir, "../bad", "baby.png", "baby");

        let error = load_user_pet_package(&dir).expect_err("unsafe id rejected");
        assert!(error.contains("unsafe pet package id"));

        fs::remove_dir_all(dir).expect("cleanup pet package dir");
    }

    #[test]
    fn load_user_pet_package_rejects_unsafe_image_paths() {
        for image_path in [
            "../baby.png",
            "/tmp/baby.png",
            "https://example.com/baby.png",
        ] {
            let dir = temp_pet_package_dir("unsafe-image-path");
            write_pet_package_manifest(&dir, "moon-cat", image_path, "baby");

            let error = load_user_pet_package(&dir).expect_err("unsafe image path rejected");
            assert!(
                error.contains("unsafe pet image path"),
                "{image_path}: {error}"
            );

            fs::remove_dir_all(dir).expect("cleanup pet package dir");
        }
    }

    #[test]
    fn load_user_pet_package_rejects_packages_without_hatched_stage() {
        let dir = temp_pet_package_dir("egg-only");
        fs::write(dir.join("egg.png"), [0_u8]).expect("image bytes");
        write_pet_package_manifest(&dir, "moon-cat", "egg.png", "egg");

        let error = load_user_pet_package(&dir).expect_err("hatched stage required");
        assert!(error.contains("at least one hatched stage"));

        fs::remove_dir_all(dir).expect("cleanup pet package dir");
    }

    #[test]
    fn load_user_pet_package_enforces_image_extension_and_size() {
        let unsupported_dir = temp_pet_package_dir("unsupported-image");
        fs::write(unsupported_dir.join("baby.gif"), [0_u8]).expect("image bytes");
        write_pet_package_manifest(&unsupported_dir, "moon-cat", "baby.gif", "baby");
        let unsupported_error =
            load_user_pet_package(&unsupported_dir).expect_err("unsupported image rejected");
        assert!(unsupported_error.contains("unsupported image type"));
        fs::remove_dir_all(unsupported_dir).expect("cleanup unsupported package dir");

        let oversized_dir = temp_pet_package_dir("oversized-image");
        let file = fs::File::create(oversized_dir.join("baby.png")).expect("image file");
        file.set_len(USER_PET_IMAGE_MAX_BYTES + 1)
            .expect("oversized image");
        write_pet_package_manifest(&oversized_dir, "moon-cat", "baby.png", "baby");
        let oversized_error =
            load_user_pet_package(&oversized_dir).expect_err("oversized image rejected");
        assert!(oversized_error.contains("larger than 4 MB"));
        fs::remove_dir_all(oversized_dir).expect("cleanup oversized package dir");
    }

    fn image_pet_input(name: &str, file_name: &str, bytes: &[u8]) -> CreateUserPetFromImageInput {
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        CreateUserPetFromImageInput {
            name: name.into(),
            file_name: file_name.into(),
            image_base64: STANDARD.encode(bytes),
        }
    }

    #[test]
    fn create_user_pet_package_from_png_image() {
        let pets_dir = temp_pet_package_dir("generated-pets");
        let package = create_user_pet_package_from_image_dir(
            &pets_dir,
            image_pet_input(
                "月亮猫",
                "Moon Cat.PNG",
                &[0x89, b'P', b'N', b'G', 0, 1, 2, 3],
            ),
        )
        .expect("generated pet package");

        assert!(package.species_id.starts_with("petdex:image-moon-cat-"));
        assert!(is_safe_pet_manifest_id(&package.manifest_id));
        assert_eq!(package.label, "月亮猫");
        for stage_key in ["baby", "child", "adult", "elder"] {
            let stage = package.stages.get(stage_key).expect("hatched stage");
            let part = stage.parts.first().expect("body part");
            assert_eq!(stage.renderer, "cutout");
            assert_eq!(part.id, "body");
            assert_eq!(part.slot_id, "body");
            assert_eq!(part.motion_role, "none");
            assert!(part.image_src.starts_with("data:image/png;base64,"));
        }
        let package_dir = pets_dir.join(&package.manifest_id);
        assert!(package_dir.join("manifest.json").exists());
        assert!(package_dir.join("body.png").exists());

        fs::remove_dir_all(pets_dir).expect("cleanup generated pets dir");
    }

    #[test]
    fn create_user_pet_package_accepts_jpeg_and_webp_magic() {
        let pets_dir = temp_pet_package_dir("generated-image-types");
        let jpeg = create_user_pet_package_from_image_dir(
            &pets_dir,
            image_pet_input("JPEG Pet", "pet.jpeg", &[0xff, 0xd8, 0xff, 0, 1]),
        )
        .expect("jpeg pet package");
        let webp = create_user_pet_package_from_image_dir(
            &pets_dir,
            image_pet_input("WEBP Pet", "pet.webp", b"RIFFxxxxWEBPpayload"),
        )
        .expect("webp pet package");

        assert!(jpeg.stages["baby"].parts[0]
            .image_src
            .starts_with("data:image/jpeg;base64,"));
        assert!(webp.stages["baby"].parts[0]
            .image_src
            .starts_with("data:image/webp;base64,"));

        fs::remove_dir_all(pets_dir).expect("cleanup generated image type dirs");
    }

    #[test]
    fn create_user_pet_package_rejects_bad_image_payloads() {
        let pets_dir = temp_pet_package_dir("bad-generated-image");

        let unsupported = create_user_pet_package_from_image_dir(
            &pets_dir,
            image_pet_input("GIF Pet", "pet.gif", &[b'G', b'I', b'F']),
        )
        .expect_err("unsupported extension rejected");
        assert!(unsupported.contains("unsupported image type"));

        let mismatch = create_user_pet_package_from_image_dir(
            &pets_dir,
            image_pet_input("Wrong Pet", "pet.png", &[0xff, 0xd8, 0xff, 0]),
        )
        .expect_err("magic mismatch rejected");
        assert!(mismatch.contains("does not match"));

        let empty_name = create_user_pet_package_from_image_dir(
            &pets_dir,
            image_pet_input("   ", "pet.png", &[0x89, b'P', b'N', b'G']),
        )
        .expect_err("empty name rejected");
        assert!(empty_name.contains("pet name"));

        fs::remove_dir_all(pets_dir).expect("cleanup bad generated image dir");
    }

    #[test]
    fn create_user_pet_package_rejects_oversized_base64_payload() {
        let pets_dir = temp_pet_package_dir("oversized-generated-image");
        let input = CreateUserPetFromImageInput {
            name: "Big Pet".into(),
            file_name: "pet.png".into(),
            image_base64: "A".repeat((((USER_PET_IMAGE_MAX_BYTES + 2) / 3 * 4) + 20) as usize),
        };

        let error = create_user_pet_package_from_image_dir(&pets_dir, input)
            .expect_err("oversized payload rejected");
        assert!(error.contains("larger than 4 MB"));

        fs::remove_dir_all(pets_dir).expect("cleanup oversized generated image dir");
    }

    fn coding_event(overrides: Value) -> CodingEvent {
        let base = json!({
          "id": "event-1",
          "kind": "commit-created",
          "source": "codex",
          "title": "完成 commit",
          "summary": "提交成功。",
          "status": "succeeded",
          "createdAt": "2026-04-28T11:05:30.000Z",
          "metadata": null
        });
        serde_json::from_value(merge_json(base, overrides)).expect("valid coding event")
    }

    fn merge_json(base: Value, patch: Value) -> Value {
        match (base, patch) {
            (Value::Object(mut base_map), Value::Object(patch_map)) => {
                for (key, value) in patch_map {
                    let next = match (base_map.remove(&key), value) {
                        (Some(existing @ Value::Object(_)), Value::Object(patch_object)) => {
                            merge_json(existing, Value::Object(patch_object))
                        }
                        (_, value) => value,
                    };
                    base_map.insert(key, next);
                }
                Value::Object(base_map)
            }
            (_, patch) => patch,
        }
    }

    fn pet_root_with_system(vacation_mode: bool, boss_mode_enabled: bool) -> Map<String, Value> {
        serde_json::from_value(json!({
          "ui": {
            "system": {
              "vacationMode": vacation_mode,
              "bossModeEnabled": boss_mode_enabled
            }
          }
        }))
        .expect("valid pet root")
    }

    fn pet_root_with_strong_reminder() -> Map<String, Value> {
        serde_json::from_value(json!({
          "ui": {
            "system": {
              "strongReminderEnabled": true
            }
          }
        }))
        .expect("valid pet root")
    }

    #[test]
    fn merge_pet_memory_events_keeps_newer_disk_coding_event() {
        let existing = json!({
          "memory": {
            "events": [{
              "id": "final-stable-commit-1",
              "ts": "2026-04-28T11:05:30.000Z",
              "type": "commit-created",
              "summary": "最终稳定性验证的 commit 事件。"
            }]
          }
        });

        let incoming = json!({
          "memory": {
            "events": (0..40).map(|index| json!({
              "id": format!("idle-{index}"),
              "ts": format!("2026-04-28T08:{:02}:00.000Z", index % 60),
              "type": "idle",
              "summary": "older idle"
            })).collect::<Vec<_>>()
          }
        });

        let merged = merge_pet_memory_events(&existing, incoming);
        let events = merged
            .get("memory")
            .and_then(Value::as_object)
            .and_then(|memory| memory.get("events"))
            .and_then(Value::as_array)
            .expect("merged events array");

        assert_eq!(events.len(), 40);
        assert_eq!(
            events[0].get("id").and_then(Value::as_str),
            Some("final-stable-commit-1")
        );
        assert!(events
            .iter()
            .any(|event| event.get("id").and_then(Value::as_str) == Some("final-stable-commit-1")));
        assert!(!events
            .iter()
            .any(|event| event.get("id").and_then(Value::as_str) == Some("idle-0")));
    }

    #[test]
    fn merge_pet_memory_events_keeps_existing_hatched_state_over_stale_egg_save() {
        let existing = json!({
          "personality": {
            "name": "啵啵",
            "species": "custom"
          },
          "state": {
            "stage": "baby",
            "hatchedAt": "2026-04-29T03:51:15.277Z",
            "ageDays": 0
          },
          "memory": {
            "profile": {
              "chosenSpecies": "custom",
              "petName": "啵啵"
            },
            "bond": {
              "summary": "它终于破壳见到你了。"
            },
            "relationship": {
              "anniversaryStartedAt": "2026-04-29T03:51:15.277Z"
            },
            "daily": [{
              "date": "2026-04-29",
              "summary": "啵啵今天终于破壳。"
            }],
            "traits": {
              "bond": 56
            },
            "events": [{
              "id": "hatched-event",
              "ts": "2026-04-29T03:51:15.277Z",
              "type": "chat"
            }]
          },
          "ui": {
            "onboardingCompleted": true,
            "onboarding": {
              "currentStep": "hatch",
              "finishedAt": "2026-04-29T03:51:15.277Z"
            }
          }
        });

        let incoming = json!({
          "personality": {
            "name": "啵啵",
            "species": "puppy"
          },
          "state": {
            "stage": "egg",
            "ageDays": 0
          },
          "memory": {
            "profile": {
              "chosenSpecies": "puppy",
              "petName": "啵啵"
            },
            "events": [{
              "id": "stale-idle-event",
              "ts": "2026-04-29T03:51:59.179Z",
              "type": "idle"
            }]
          },
          "ui": {
            "onboardingCompleted": false,
            "onboarding": {
              "currentStep": "identity"
            }
          }
        });

        let merged = merge_pet_memory_events(&existing, incoming);

        assert_eq!(
            merged.pointer("/state/stage").and_then(Value::as_str),
            Some("baby")
        );
        assert_eq!(
            merged.pointer("/state/hatchedAt").and_then(Value::as_str),
            Some("2026-04-29T03:51:15.277Z")
        );
        assert_eq!(
            merged
                .pointer("/personality/species")
                .and_then(Value::as_str),
            Some("custom")
        );
        assert_eq!(
            merged
                .pointer("/memory/profile/chosenSpecies")
                .and_then(Value::as_str),
            Some("custom")
        );
        assert_eq!(
            merged
                .pointer("/ui/onboardingCompleted")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert!(merged
            .pointer("/memory/events")
            .and_then(Value::as_array)
            .expect("events array")
            .iter()
            .any(|event| event.get("id").and_then(Value::as_str) == Some("stale-idle-event")));
    }

    #[test]
    fn merge_pet_memory_events_keeps_newer_appearance_change_over_stale_save() {
        let existing = json!({
          "personality": {
            "name": "啵啵",
            "species": "piglet"
          },
          "state": {
            "stage": "baby",
            "hatchedAt": "2026-04-29T03:51:15.277Z"
          },
          "memory": {
            "profile": {
              "chosenSpecies": "piglet",
              "petName": "啵啵"
            },
            "events": []
          },
          "ui": {
            "onboardingCompleted": true,
            "speciesChangedAt": "2026-05-05T02:00:00.000Z",
            "speciesVariantBySpecies": {
              "prompt-1": "v2"
            }
          }
        });

        let incoming = json!({
          "personality": {
            "name": "啵啵",
            "species": "puppy"
          },
          "state": {
            "stage": "baby",
            "hatchedAt": "2026-04-29T03:51:15.277Z"
          },
          "memory": {
            "profile": {
              "chosenSpecies": "puppy",
              "petName": "啵啵"
            },
            "events": [{
              "id": "stale-idle-event",
              "ts": "2026-05-05T02:00:01.000Z",
              "type": "idle"
            }]
          },
          "ui": {
            "onboardingCompleted": true,
            "speciesChangedAt": "2026-05-05T01:59:00.000Z",
            "speciesVariantBySpecies": {}
          }
        });

        let merged = merge_pet_memory_events(&existing, incoming);

        assert_eq!(
            merged
                .pointer("/personality/species")
                .and_then(Value::as_str),
            Some("piglet")
        );
        assert_eq!(
            merged
                .pointer("/memory/profile/chosenSpecies")
                .and_then(Value::as_str),
            Some("piglet")
        );
        assert_eq!(
            merged
                .pointer("/ui/speciesChangedAt")
                .and_then(Value::as_str),
            Some("2026-05-05T02:00:00.000Z")
        );
        assert_eq!(
            merged
                .pointer("/ui/speciesVariantBySpecies/prompt-1")
                .and_then(Value::as_str),
            Some("v2")
        );
        assert!(merged
            .pointer("/memory/events")
            .and_then(Value::as_array)
            .expect("events array")
            .iter()
            .any(|event| event.get("id").and_then(Value::as_str) == Some("stale-idle-event")));
    }

    #[test]
    fn merge_pet_memory_events_dedupes_same_event_id() {
        let existing = json!({
          "memory": {
            "events": [{
              "id": "duplicate-event",
              "ts": "2026-04-28T11:05:30.000Z",
              "type": "commit-created",
              "summary": "disk"
            }]
          }
        });

        let incoming = json!({
          "memory": {
            "events": [
              {
                "id": "duplicate-event",
                "ts": "2026-04-28T11:05:30.000Z",
                "type": "commit-created",
                "summary": "incoming"
              },
              {
                "id": "other-event",
                "ts": "2026-04-28T11:04:00.000Z",
                "type": "idle",
                "summary": "other"
              }
            ]
          }
        });

        let merged = merge_pet_memory_events(&existing, incoming);
        let events = merged
            .get("memory")
            .and_then(Value::as_object)
            .and_then(|memory| memory.get("events"))
            .and_then(Value::as_array)
            .expect("merged events array");

        assert_eq!(events.len(), 2);
        assert_eq!(
            events
                .iter()
                .filter(|event| event.get("id").and_then(Value::as_str) == Some("duplicate-event"))
                .count(),
            1
        );
    }

    #[test]
    fn coding_event_should_record_memory_skips_running_task_start() {
        assert!(!coding_event_should_record_memory(&coding_event(json!({
          "id": "final-stable-running-1",
          "kind": "task-start",
          "status": "running"
        }))));
        assert!(coding_event_should_record_memory(&coding_event(json!({
          "id": "final-stable-commit-1",
          "kind": "commit-created",
          "status": "succeeded"
        }))));
        assert!(coding_event_should_record_memory(&coding_event(json!({
          "id": "final-mute-fail-1",
          "kind": "test-fail",
          "status": "failed"
        }))));
    }

    #[test]
    fn permission_attention_event_does_not_fire_strong_reminder() {
        let permission = coding_event(json!({
          "id": "permission-attention-1",
          "kind": "task-failed",
          "status": "failed",
          "metadata": {
            "hookEventName": "PermissionRequest",
            "toolName": "Bash"
          }
        }));
        let real_failure = coding_event(json!({
          "id": "real-failure-1",
          "kind": "task-failed",
          "status": "failed"
        }));

        assert!(!coding_event_should_fire_strong_reminder(&pet_root_with_strong_reminder(), &permission));
        assert!(coding_event_should_fire_strong_reminder(&pet_root_with_strong_reminder(), &real_failure));
    }

    #[test]
    fn coding_event_is_muted_only_for_running_events_in_muted_modes() {
        let running = coding_event(json!({
          "id": "final-mute-running-1",
          "kind": "task-start",
          "status": "running"
        }));
        let failed = coding_event(json!({
          "id": "final-mute-fail-1",
          "kind": "test-fail",
          "status": "failed"
        }));

        assert!(coding_event_is_muted(
            &pet_root_with_system(true, false),
            &running
        ));
        assert!(coding_event_is_muted(
            &pet_root_with_system(false, true),
            &running
        ));
        assert!(!coding_event_is_muted(
            &pet_root_with_system(false, false),
            &running
        ));
        assert!(!coding_event_is_muted(
            &pet_root_with_system(true, false),
            &failed
        ));
    }
}

fn main() {
    let builder = tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            load_pet,
            load_pet_reconciled,
            save_pet,
            load_domain_state,
            save_domain_state,
            load_reminders,
            create_reminder,
            complete_reminder,
            snooze_reminder,
            consume_due_reminders,
            write_calendar_event,
            emit_coding_event,
            load_model_config,
            save_model_config,
            ensure_model_service,
            set_window_position,
            set_dock_hover,
            set_panel_open,
            set_pet_hit_region,
            set_pet_window_bounds,
            interrupt_walk,
            bring_pet_to_active_monitor,
            notify_user_strong,
            capture_screen_text,
            save_share_card,
            write_pet_snapshot,
            reveal_in_file_manager,
            load_diary,
            save_diary,
            set_activity_tracking,
            get_active_minutes,
            get_git_diary_stats,
            list_user_pet_packages,
            open_user_pet_dir,
            create_user_pet_from_image,
            list_user_wardrobe_assets,
            open_user_wardrobe_dir
        ]);

    #[cfg(feature = "webdriver")]
    let builder = builder.plugin(tauri_plugin_webdriver::init());

    builder
        .setup(|app| {
            let pet_window = WebviewWindowBuilder::new(app, "pet", pet_window_url())
                .title("AIEvoPet")
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .resizable(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .visible(true)
                .center()
                .inner_size(PET_HIT_SIZE, PET_HIT_SIZE + 84.0)
                .build()?;

            // Pin the pet to the user's primary monitor and make it follow
            // whichever virtual desktop / Space is currently active on that
            // monitor. We deliberately do NOT use `current_monitor()` here:
            // on multi-display setups the OS sometimes parks the freshly
            // created window on the secondary screen, which contradicts the
            // product rule "the pet lives on the primary screen, always on
            // top, across all Spaces". `set_visible_on_all_workspaces(true)`
            // is the macOS NSWindowCollectionBehaviorCanJoinAllSpaces bit;
            // on Windows/Linux it is a no-op, which is fine because virtual
            // desktops there don't usually clip always-on-top windows.
            let primary_monitor = app.primary_monitor().ok().flatten().or_else(|| {
                app.available_monitors()
                    .ok()
                    .and_then(|mut monitors| monitors.pop())
            });
            if let Some(monitor) = primary_monitor {
                let monitor_position = monitor.position();
                let monitor_size = monitor.size();
                let pet_x = monitor_position.x + 72;
                let pet_y = monitor_position.y
                    + (monitor_size.height as i32 - PET_HIT_SIZE as i32 - 48).max(24);
                let _ = pet_window
                    .set_position(Position::Physical(PhysicalPosition::new(pet_x, pet_y)));
            }
            let _ = pet_window.set_visible_on_all_workspaces(true);
            let _ = pet_window.set_always_on_top(true);
            apply_pet_window_macos_overlay_behavior(&pet_window);

            let panel_window = WebviewWindowBuilder::new(app, "panel", panel_window_url())
                .title("AIEvoPet Panel")
                .transparent(true)
                .resizable(true)
                .decorations(true)
                .always_on_top(true)
                .visible(false)
                .inner_size(PANEL_WIDTH, PANEL_HEIGHT)
                .center()
                .build()?;

            // Intercept the OS close button so the panel window survives. Without
            // this, clicking the red traffic light destroys the window and any
            // subsequent `set_panel_open` invocation fails with "panel window
            // missing", which manifests as the pet becoming unclickable.
            {
                let app_handle = app.handle().clone();
                panel_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(panel) = app_handle.get_webview_window("panel") {
                            let _ = panel.hide();
                        }
                        let state = app_handle.state::<AppState>();
                        if let Ok(mut open) = state.panel_open.lock() {
                            *open = false;
                        }
                        let _ = app_handle.emit("tray-action", "closePanel");
                    }
                });
            }

            let _ = pet_window.show();
            let _ = pet_window.set_ignore_cursor_events(false);
            let _ = panel_window.hide();
            ensure_reminder_scheduler(&app.handle().clone(), &app.state::<AppState>())?;
            ensure_walk_scheduler(&app.handle().clone(), &app.state::<AppState>())?;
            ensure_coding_event_bridge(&app.handle().clone(), &app.state::<AppState>())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
