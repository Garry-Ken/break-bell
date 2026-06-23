import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Config, Status } from '../types'

export const inTauri = (() => {
  try {
    return isTauri()
  } catch {
    return false
  }
})()

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!inTauri) {
    console.info(`[web] invoke skipped: ${cmd}`, args ?? '')
    return null
  }
  return invoke<T>(cmd, args)
}

/** 把整份配置同步给 Rust 调度器（内存源 + 触发行为参数）。 */
export const applySchedule = (config: Config) => safeInvoke('apply_schedule', { config })

/** 暂停/恢复闹钟。 */
export const setPaused = (paused: boolean) => safeInvoke('set_paused', { paused })

/** 立即预览一次休息遮罩（设置页「预览」）。 */
export const previewBreak = (seconds: number, prompt: string, allowSkip: boolean) =>
  safeInvoke('preview_break', { seconds, prompt, allowSkip })

/** 试听铃声。 */
export const playRing = (sound: string, volume: number) => safeInvoke('play_ring', { sound, volume })

/** 提前结束当前休息（遮罩上的「跳过」）。 */
export const skipBreak = () => safeInvoke('skip_break')

/** 开机自启。 */
export const setAutostart = (enabled: boolean) => safeInvoke('set_autostart', { enabled })

/** 读取运行状态。 */
export const getStatus = () => safeInvoke<Status>('get_status')

/** 监听状态变化（托盘「暂停」会从 Rust 侧推送）。 */
export async function onStatusChanged(cb: (s: Status) => void): Promise<() => void> {
  if (!inTauri) return () => {}
  return listen<Status>('status-changed', (e) => cb(e.payload))
}

/** 监听「打开设置/打开主面板」之类的导航事件（托盘菜单可触发）。 */
export async function onNavigate(cb: (route: string) => void): Promise<() => void> {
  if (!inTauri) return () => {}
  return listen<string>('navigate', (e) => cb(e.payload))
}
