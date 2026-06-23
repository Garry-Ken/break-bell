use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, Local, TimeZone};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

#[cfg(target_os = "windows")]
extern "system" {
    fn SetThreadExecutionState(es_flags: u32) -> u32;
}

// ───────────────────────── 数据模型 ─────────────────────────

fn default_true() -> bool {
    true
}

#[derive(Clone, Serialize, Deserialize)]
struct Alarm {
    #[serde(default)]
    id: String,
    time: String, // "HH:MM"
    #[serde(default = "default_true")]
    enabled: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct RuntimeConfig {
    alarms: Vec<Alarm>,
    break_minutes: u32,
    sound: String,
    volume: f32,
    allow_skip: bool,
    os_lock: bool,
    prompt: String,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            alarms: Vec::new(),
            break_minutes: 5,
            sound: "chime".into(),
            volume: 0.8,
            allow_skip: true,
            os_lock: false,
            prompt: "去喝水 · 起来拉伸".into(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    paused: bool,
    break_active: bool,
}

#[derive(Default)]
struct AppState {
    cfg: Mutex<RuntimeConfig>,
    paused: Mutex<bool>,
    break_active: Mutex<bool>,
    keepawake: Mutex<Option<KeepAwake>>,
    last_tick: Mutex<Option<DateTime<Local>>>,
    fired: Mutex<HashMap<String, String>>, // "HH:MM" -> "YYYY-MM-DD"
}

// ───────────────────────── 防止息屏 ─────────────────────────

struct KeepAwake {
    #[cfg(target_os = "macos")]
    child: Option<std::process::Child>,
    #[cfg(target_os = "windows")]
    _stop: Option<std::sync::mpsc::Sender<()>>,
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    _noop: (),
}

impl KeepAwake {
    fn start() -> Self {
        #[cfg(target_os = "macos")]
        let me = {
            // caffeinate -d 阻止显示器休眠；kill 子进程即释放
            let child = std::process::Command::new("caffeinate").arg("-d").spawn().ok();
            KeepAwake { child }
        };
        #[cfg(target_os = "windows")]
        let me = {
            // SetThreadExecutionState 有线程亲和性：在一条常驻线程上设置，drop 时复位
            let (tx, rx) = std::sync::mpsc::channel::<()>();
            std::thread::spawn(move || {
                const ES_CONTINUOUS: u32 = 0x8000_0000;
                const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;
                const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED);
                }
                let _ = rx.recv(); // 阻塞直到 sender 被 drop
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS);
                }
            });
            KeepAwake { _stop: Some(tx) }
        };
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let me = KeepAwake { _noop: () };
        me
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        if let Some(c) = self.child.as_mut() {
            let _ = c.kill();
        }
        // windows: 丢弃 _stop sender → 常驻线程 recv 返回 → 复位执行状态
    }
}

// ───────────────────────── 平台动作 ─────────────────────────

/// 真·系统锁屏（设置里「同时锁定系统」开启时调用）。
fn os_lock() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new(
            "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession",
        )
        .arg("-suspend")
        .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("rundll32.exe")
            .arg("user32.dll,LockWorkStation")
            .spawn();
    }
}

/// macOS：把遮罩窗抬到菜单栏/Dock 之上，并允许浮于全屏 App 之上。
#[cfg(target_os = "macos")]
fn raise_above_everything(win: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::id;
    if let Ok(ns) = win.ns_window() {
        let ns = ns as id;
        unsafe {
            // NSStatusWindowLevel = 25，高于菜单栏与 Dock
            ns.setLevel_(25);
            let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary;
            ns.setCollectionBehavior_(behavior);
        }
    }
}

/// 最小 percent-encode，保证中文提示语安全塞进 query。
fn pct(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// ───────────────────────── 遮罩 / 休息 ─────────────────────────

/// 每块显示器建一个全屏置顶无边框遮罩窗。
fn show_overlay(app: &AppHandle, secs: u32, prompt: &str, allow_skip: bool) {
    let monitors = app.available_monitors().unwrap_or_default();
    let prompt_enc = pct(prompt);
    for (i, m) in monitors.iter().enumerate() {
        let label = format!("overlay-{i}");
        if app.get_webview_window(&label).is_some() {
            continue;
        }
        let url = format!(
            "index.html?overlay=1&secs={}&skip={}&prompt={}",
            secs, allow_skip as u8, prompt_enc
        );
        let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible_on_all_workspaces(true)
            .resizable(false)
            .shadow(false)
            .focused(true)
            .visible(false)
            .build();
        match built {
            Ok(win) => {
                // 无边框窗有时忽略 builder 初值，建完按显示器物理坐标兜底
                let _ = win.set_position(*m.position());
                let _ = win.set_size(*m.size());
                #[cfg(target_os = "macos")]
                raise_above_everything(&win);
                let _ = win.show();
                let _ = win.set_focus();
            }
            Err(e) => eprintln!("[overlay] build failed: {e}"),
        }
    }
}

fn close_overlays(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay-") {
            let _ = win.close();
        }
    }
}

/// 触发一次完整休息：响铃 + （锁屏 或 遮罩）+ 到时收尾。
fn fire_break(app: &AppHandle, cfg: &RuntimeConfig) {
    {
        let st = app.state::<AppState>();
        *st.break_active.lock().unwrap() = true;
    }
    play_ring_internal(&cfg.sound, cfg.volume);
    let secs = cfg.break_minutes.max(1) * 60;

    if cfg.os_lock {
        os_lock();
    } else {
        show_overlay(app, secs, &cfg.prompt, cfg.allow_skip);
        let st = app.state::<AppState>();
        *st.keepawake.lock().unwrap() = Some(KeepAwake::start());
    }
    emit_status(app);

    // 到时收尾（end_break 幂等：被「跳过」提前结束也安全）
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(secs as u64)).await;
        end_break(&app2);
    });
}

/// 结束当前休息：关遮罩、停防息屏、清状态。幂等。
fn end_break(app: &AppHandle) {
    let st = app.state::<AppState>();
    {
        let mut ba = st.break_active.lock().unwrap();
        if !*ba {
            return;
        }
        *ba = false;
    }
    close_overlays(app);
    *st.keepawake.lock().unwrap() = None;
    emit_status(app);
}

fn play_ring_internal(sound: &str, volume: f32) {
    let bytes: &'static [u8] = match sound {
        "bell" => include_bytes!("../../public/sounds/bell.wav"),
        "drop" => include_bytes!("../../public/sounds/drop.wav"),
        _ => include_bytes!("../../public/sounds/chime.wav"),
    };
    let vol = volume.clamp(0.0, 1.0);
    std::thread::spawn(move || {
        if let Ok((_stream, handle)) = rodio::OutputStream::try_default() {
            if let Ok(sink) = rodio::Sink::try_new(&handle) {
                sink.set_volume(vol);
                if let Ok(src) = rodio::Decoder::new(std::io::Cursor::new(bytes)) {
                    sink.append(src);
                    sink.sleep_until_end(); // 持有 _stream 直到放完，否则静音
                }
            }
        }
    });
}

fn emit_status(app: &AppHandle) {
    let st = app.state::<AppState>();
    let payload = Status {
        paused: *st.paused.lock().unwrap(),
        break_active: *st.break_active.lock().unwrap(),
    };
    let _ = app.emit("status-changed", payload);
}

// ───────────────────────── 调度循环 ─────────────────────────

fn today_at(hhmm: &str, now: DateTime<Local>) -> Option<DateTime<Local>> {
    let (h, m) = hhmm.split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    let naive = now.date_naive().and_hms_opt(h, m, 0)?;
    Local.from_local_datetime(&naive).single()
}

fn spawn_scheduler(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        {
            // 启动时把基准设为「现在」，避免补发今天早些时候已过的闹钟
            let st = app.state::<AppState>();
            *st.last_tick.lock().unwrap() = Some(Local::now());
        }
        let mut tick = tokio::time::interval(Duration::from_secs(15));
        loop {
            tick.tick().await;
            let st = app.state::<AppState>();

            let paused = *st.paused.lock().unwrap();
            let busy = *st.break_active.lock().unwrap();
            let now = Local::now();

            if paused || busy {
                *st.last_tick.lock().unwrap() = Some(now);
                continue;
            }

            let last = {
                let g = st.last_tick.lock().unwrap();
                g.unwrap_or(now)
            };
            let cfg = st.cfg.lock().unwrap().clone();
            let break_secs = (cfg.break_minutes.max(1) * 60) as i64;
            let today = now.format("%Y-%m-%d").to_string();

            let mut fire: Option<RuntimeConfig> = None;
            for a in cfg.alarms.iter().filter(|a| a.enabled) {
                if let Some(t) = today_at(&a.time, now) {
                    // 到点判定：上一拍 < 闹钟时刻 <= 现在
                    if t > last && t <= now {
                        // 同日去重
                        {
                            let mut fired = st.fired.lock().unwrap();
                            if fired.get(&a.time).map(|d| d == &today).unwrap_or(false) {
                                continue;
                            }
                            fired.insert(a.time.clone(), today.clone());
                        }
                        // 睡眠唤醒后的陈旧闹钟（错过超过 2×休息时长）静默跳过
                        let age = (now - t).num_seconds();
                        if age >= 2 * break_secs {
                            continue;
                        }
                        fire = Some(cfg.clone());
                        break;
                    }
                }
            }

            *st.last_tick.lock().unwrap() = Some(now);

            if let Some(cfg) = fire {
                fire_break(&app, &cfg);
            }
        }
    });
}

// ───────────────────────── 命令 ─────────────────────────

#[tauri::command]
fn apply_schedule(state: State<AppState>, config: RuntimeConfig) {
    *state.cfg.lock().unwrap() = config;
}

#[tauri::command]
fn set_paused(app: AppHandle, state: State<AppState>, paused: bool) {
    *state.paused.lock().unwrap() = paused;
    emit_status(&app);
}

#[tauri::command]
fn get_status(state: State<AppState>) -> Status {
    Status {
        paused: *state.paused.lock().unwrap(),
        break_active: *state.break_active.lock().unwrap(),
    }
}

#[tauri::command]
fn play_ring(sound: String, volume: f32) {
    play_ring_internal(&sound, volume);
}

#[tauri::command]
fn preview_break(app: AppHandle, state: State<AppState>, seconds: u32, prompt: String, allow_skip: bool) {
    if *state.break_active.lock().unwrap() {
        return;
    }
    *state.break_active.lock().unwrap() = true;
    let secs = seconds.max(1);
    show_overlay(&app, secs, &prompt, allow_skip);
    *state.keepawake.lock().unwrap() = Some(KeepAwake::start());
    emit_status(&app);
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(secs as u64)).await;
        end_break(&app2);
    });
}

#[tauri::command]
fn skip_break(app: AppHandle) {
    end_break(&app);
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let m = app.autolaunch();
        if enabled {
            m.enable().map_err(|e| e.to_string())?;
        } else {
            m.disable().map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, enabled);
    Ok(())
}

// ───────────────────────── 托盘 ─────────────────────────

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开歇钟", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "暂停 / 恢复", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause, &sep, &quit])?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("歇钟")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            "pause" => {
                let st = app.state::<AppState>();
                {
                    let mut g = st.paused.lock().unwrap();
                    *g = !*g;
                }
                emit_status(app);
            }
            "quit" => app.exit(0), // 唯一真正退出的路径
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// ───────────────────────── 入口 ─────────────────────────

fn load_config_from_store(app: &AppHandle) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("config.json") {
        if let Some(v) = store.get("config") {
            if let Ok(cfg) = serde_json::from_value::<RuntimeConfig>(v) {
                *app.state::<AppState>().cfg.lock().unwrap() = cfg;
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            apply_schedule,
            set_paused,
            get_status,
            play_ring,
            preview_break,
            skip_break,
            set_autostart,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))?;

            // 背景常驻工具：只驻菜单栏/状态栏，不在 Dock 显示
            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            load_config_from_store(app.handle());
            build_tray(app.handle())?;
            spawn_scheduler(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // 关主窗 = 收进托盘，调度继续跑
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|_app, event| {
            // 防止最后一个（遮罩）窗口关闭时进程退出；退出只能走托盘 Quit
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
