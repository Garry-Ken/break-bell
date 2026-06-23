use std::sync::Mutex;
#[cfg(desktop)]
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(desktop)]
use std::time::Duration;
#[cfg(desktop)]
use chrono::{DateTime, Local, TimeZone};
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
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
    #[cfg(desktop)]
    last_tick: Mutex<Option<DateTime<Local>>>,
    #[cfg(desktop)]
    fired: Mutex<HashMap<String, String>>, // "HH:MM" -> "YYYY-MM-DD"
}

// ───────────────────────── 防止息屏（桌面） ─────────────────────────

struct KeepAwake {
    #[cfg(target_os = "macos")]
    child: Option<std::process::Child>,
    #[cfg(target_os = "windows")]
    _stop: Option<std::sync::mpsc::Sender<()>>,
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    _noop: (),
}

#[cfg(desktop)]
impl KeepAwake {
    fn start() -> Self {
        #[cfg(target_os = "macos")]
        let me = {
            let child = std::process::Command::new("caffeinate").arg("-d").spawn().ok();
            KeepAwake { child }
        };
        #[cfg(target_os = "windows")]
        let me = {
            let (tx, rx) = std::sync::mpsc::channel::<()>();
            std::thread::spawn(move || {
                const ES_CONTINUOUS: u32 = 0x8000_0000;
                const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;
                const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED);
                }
                let _ = rx.recv();
                unsafe {
                    SetThreadExecutionState(ES_CONTINUOUS);
                }
            });
            KeepAwake { _stop: Some(tx) }
        };
        me
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        if let Some(c) = self.child.as_mut() {
            let _ = c.kill();
        }
    }
}

// ───────────────────────── 平台动作（桌面） ─────────────────────────

#[cfg(desktop)]
fn os_lock() {
    #[cfg(target_os = "macos")]
    {
        // 1) login.framework 私有 API：立即真锁屏（无需权限、不依赖系统设置）。
        //    旧的 CGSession 路径在 macOS 较新版本已被移除，故改用此法。
        unsafe {
            let handle = libc::dlopen(
                c"/System/Library/PrivateFrameworks/login.framework/login".as_ptr(),
                libc::RTLD_NOW,
            );
            if !handle.is_null() {
                let sym = libc::dlsym(handle, c"SACLockScreenImmediate".as_ptr());
                if !sym.is_null() {
                    let f: extern "C" fn() -> i32 = std::mem::transmute(sym);
                    let _ = f();
                    eprintln!("[lock] SACLockScreenImmediate");
                    return;
                }
            }
        }
        // 2) 兜底：让显示器休眠（开了"睡眠后立即需要密码"即锁屏）
        let _ = std::process::Command::new("pmset").arg("displaysleepnow").spawn();
        eprintln!("[lock] pmset displaysleepnow (fallback)");
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("rundll32.exe")
            .arg("user32.dll,LockWorkStation")
            .spawn();
    }
}

#[cfg(target_os = "macos")]
fn raise_above_everything(win: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::id;
    if let Ok(ns) = win.ns_window() {
        let ns = ns as id;
        unsafe {
            ns.setLevel_(25); // NSStatusWindowLevel，高于菜单栏与 Dock
            let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary;
            ns.setCollectionBehavior_(behavior);
        }
    }
}

#[cfg(desktop)]
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

// ───────────────────────── 遮罩 / 休息（桌面） ─────────────────────────

#[cfg(desktop)]
fn show_overlay(app: &AppHandle, secs: u32, prompt: &str, allow_skip: bool) {
    let app2 = app.clone();
    let prompt = prompt.to_string();
    // macOS：创建窗口必须在主线程；调度器/命令都在后台线程，必须 marshal 回主线程
    let _ = app.run_on_main_thread(move || {
        let monitors = app2.available_monitors().unwrap_or_default();
        eprintln!("[overlay] on main thread, monitors={}", monitors.len());
        let prompt_enc = pct(&prompt);
        for (i, m) in monitors.iter().enumerate() {
            let label = format!("overlay-{i}");
            if app2.get_webview_window(&label).is_some() {
                continue;
            }
            let url = format!(
                "index.html?overlay=1&secs={}&skip={}&prompt={}",
                secs, allow_skip as u8, prompt_enc
            );
            let built = WebviewWindowBuilder::new(&app2, &label, WebviewUrl::App(url.into()))
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
                    let _ = win.set_position(*m.position());
                    let _ = win.set_size(*m.size());
                    #[cfg(target_os = "macos")]
                    raise_above_everything(&win);
                    let _ = win.show();
                    let _ = win.set_focus();
                    eprintln!("[overlay] window {label} shown");
                }
                Err(e) => eprintln!("[overlay] build failed: {e}"),
            }
        }
    });
}

#[cfg(desktop)]
fn close_overlays(app: &AppHandle) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        for (label, win) in app2.webview_windows() {
            if label.starts_with("overlay-") {
                let _ = win.close();
            }
        }
    });
}

#[cfg(desktop)]
fn fire_break(app: &AppHandle, cfg: &RuntimeConfig) {
    {
        let st = app.state::<AppState>();
        *st.break_active.lock().unwrap() = true;
    }
    let secs = cfg.break_minutes.max(1) * 60;
    eprintln!("[break] fire_break: os_lock={} secs={}", cfg.os_lock, secs);
    play_ring_internal(&cfg.sound, cfg.volume);

    // 遮罩永远弹（可靠的强制休息核心，不依赖任何权限/系统命令）
    show_overlay(app, secs, &cfg.prompt, cfg.allow_skip);

    if cfg.os_lock {
        // 额外尝试真·系统锁屏；不开 keepawake，让显示器能睡/锁
        os_lock();
    } else {
        // 保持亮屏，遮罩可见
        let st = app.state::<AppState>();
        *st.keepawake.lock().unwrap() = Some(KeepAwake::start());
    }
    emit_status(app);

    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(secs as u64));
        end_break(&app2);
    });
}

#[cfg(desktop)]
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

#[cfg(desktop)]
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
                    sink.sleep_until_end();
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

// ───────────────────────── 安卓原生桥（JNI → AlarmBridge.kt） ─────────────────────────

#[cfg(target_os = "android")]
fn call_alarm_bridge(method: &str, json: Option<&str>) -> Result<(), String> {
    use jni::objects::{JObject, JValue};
    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    let activity = unsafe { JObject::from_raw(ctx.context().cast()) };
    match json {
        Some(j) => {
            let jstr = env.new_string(j).map_err(|e| e.to_string())?;
            let jobj = JObject::from(jstr);
            env.call_static_method(
                "com/garry/breakbell/AlarmBridge",
                method,
                "(Landroid/content/Context;Ljava/lang/String;)V",
                &[JValue::Object(&activity), JValue::Object(&jobj)],
            )
            .map_err(|e| e.to_string())?;
        }
        None => {
            env.call_static_method(
                "com/garry/breakbell/AlarmBridge",
                method,
                "(Landroid/content/Context;)V",
                &[JValue::Object(&activity)],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_apply(times: Vec<String>, break_minutes: u32, prompt: String, allow_skip: bool) -> Result<(), String> {
    let json = serde_json::json!({
        "times": times,
        "breakMinutes": break_minutes,
        "prompt": prompt,
        "allowSkip": allow_skip,
    })
    .to_string();
    call_alarm_bridge("schedule", Some(&json))
}

#[cfg(target_os = "android")]
#[tauri::command]
fn android_cancel() -> Result<(), String> {
    call_alarm_bridge("cancel", None)
}

// ───────────────────────── 调度循环（桌面） ─────────────────────────

#[cfg(desktop)]
fn today_at(hhmm: &str, now: DateTime<Local>) -> Option<DateTime<Local>> {
    let (h, m) = hhmm.split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    let naive = now.date_naive().and_hms_opt(h, m, 0)?;
    Local.from_local_datetime(&naive).single()
}

#[cfg(desktop)]
fn spawn_scheduler(app: AppHandle) {
    // 用独立系统线程跑，避开 tokio time 驱动的任何不确定性（每 10s 比对墙钟）
    std::thread::spawn(move || {
        {
            let st = app.state::<AppState>();
            *st.last_tick.lock().unwrap() = Some(Local::now());
        }
        eprintln!("[sched] scheduler thread started");
        loop {
            std::thread::sleep(Duration::from_secs(10));
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
                    if t > last && t <= now {
                        {
                            let mut fired = st.fired.lock().unwrap();
                            if fired.get(&a.time).map(|d| d == &today).unwrap_or(false) {
                                continue;
                            }
                            fired.insert(a.time.clone(), today.clone());
                        }
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

// ───────────────────────── 命令（共享） ─────────────────────────

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

// ───────────────────────── 命令（桌面） ─────────────────────────

#[cfg(desktop)]
#[tauri::command]
fn play_ring(sound: String, volume: f32) {
    play_ring_internal(&sound, volume);
}

#[cfg(desktop)]
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
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(secs as u64));
        end_break(&app2);
    });
}

#[cfg(desktop)]
#[tauri::command]
fn skip_break(app: AppHandle) {
    end_break(&app);
}

#[cfg(desktop)]
#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(|e| e.to_string())?;
    } else {
        m.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ───────────────────────── 托盘（桌面） ─────────────────────────

#[cfg(desktop)]
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(desktop)]
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
            "quit" => app.exit(0),
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
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::default());

    let builder = builder
        .setup(|app| {
            load_config_from_store(app.handle());
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None,
                ))?;
                #[cfg(target_os = "macos")]
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                build_tray(app.handle())?;
                spawn_scheduler(app.handle().clone());
            }
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            apply_schedule,
            set_paused,
            get_status,
            play_ring,
            preview_break,
            skip_break,
            set_autostart,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        });

    #[cfg(target_os = "android")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        apply_schedule,
        set_paused,
        get_status,
        android_apply,
        android_cancel,
    ]);
    #[cfg(all(mobile, not(target_os = "android")))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        apply_schedule,
        set_paused,
        get_status,
    ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri app");

    #[cfg(desktop)]
    app.run(|_app, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
    #[cfg(mobile)]
    app.run(|_app, _event| {});
}
