# 歇钟 · BreakBell

跨平台「定时强制休息」闹钟：一键铺满一天的喝水 / 拉伸提醒，到点响铃并**全屏盖屏 5 分钟**，逼自己离开工位。

> 机制是**全屏强制休息遮罩**（不是真锁屏——任何系统都挡不住用密码解锁）。真·系统锁屏是可选开关，默认关。

## 功能

- **一键设 N 个闹钟**：选每日时段（如 09:00–22:00）自动均分；或「固定间隔」每 N 分钟。逐条可改 / 删 / 开关。
- **到点**：响铃 + 全屏置顶遮罩盖住所有显示器，倒计时 + 「去喝水 · 起来拉伸」提示，结束自动消失，可选「跳过」。
- **托盘常驻**：关窗口 = 收进菜单栏 / 托盘，调度继续跑；仅菜单「退出」才真退。
- **设置**：铃声 + 音量（带试听）、休息时长、提示语、允许跳过、同时锁定系统（可选）、开机自启。
- **纯本地**：无账号、无后端、无联网，配置存本地。

## 平台

| 平台 | 状态 |
|---|---|
| macOS | ✅ 全屏强制休息遮罩（`.dmg`） |
| Windows | ✅ 全屏强制休息遮罩（`.exe`，经 CI 构建） |
| Android | ✅ v0.1：后台通知定时响铃 + App 内全屏休息遮罩；强制盖屏（覆盖其它 App / 锁屏）为后续原生增强 |

桌面端用置顶无边框遮罩窗强制休息；安卓端用 `tauri-plugin-notification`（AlarmManager + 精确闹钟权限）在后台定时响铃，App 在前台时弹出 App 内休息遮罩。

## 开发

```bash
pnpm install
pnpm tauri dev      # 桌面开发（端口 5192）
pnpm test           # 排程逻辑单元测试
pnpm tauri build    # 出当前平台安装包（macOS .dmg / Windows .exe）

# 安卓（需 JDK17 + Android SDK/NDK）
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.1.12297006
pnpm tauri android build --debug --apk --target aarch64
```

三端安装包也由 GitHub Actions 在打 `v*` tag 时自动构建并发到 [Releases](../../releases)。

## 技术栈

Tauri 2 · React 19 · Vite · Tailwind 3 · Rust（tokio 调度 + rodio 响铃 + 多显示器遮罩窗）。

桌面三端安装包由 GitHub Actions（`tauri-action`）在打 `v*` tag 时自动构建并发布到 Releases。
