import { invoke } from '@tauri-apps/api/core'
import type { Config } from '../types'

/**
 * 安卓原生闹钟桥：调用 Rust 命令 → JNI → Kotlin AlarmBridge。
 * AlarmBridge 用精确 AlarmManager 排程，到点由前台服务画全屏悬浮窗强制休息。
 */
export async function applyMobile(config: Config, paused: boolean): Promise<void> {
  try {
    if (paused) {
      await invoke('android_cancel')
      return
    }
    const times = config.alarms.filter((a) => a.enabled).map((a) => a.time)
    await invoke('android_apply', {
      times,
      breakMinutes: config.breakMinutes,
      prompt: config.prompt || '去喝水 · 起来拉伸',
      allowSkip: config.allowSkip,
    })
  } catch (e) {
    console.warn('applyMobile failed', e)
  }
}
