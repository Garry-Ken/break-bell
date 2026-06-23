import {
  sendNotification,
  cancelAll,
  requestPermission,
  isPermissionGranted,
  createChannel,
  Importance,
  Visibility,
  Schedule,
} from '@tauri-apps/plugin-notification'
import type { Config } from '../types'
import { hhmmToMinutes } from './format'

const CHANNEL_ID = 'break-bell-alarms'
// 一次性通知滚动窗口：每次开 App / 改配置时重排未来 N 天，避免依赖不确定的“重复”语义
const DAYS_AHEAD = 3

export async function ensureNotifPermission(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted()
    if (!granted) granted = (await requestPermission()) === 'granted'
    return granted
  } catch {
    return false
  }
}

async function ensureChannel() {
  try {
    await createChannel({
      id: CHANNEL_ID,
      name: '喝水 / 拉伸提醒',
      importance: Importance.High, // 抬头通知 + 响铃
      visibility: Visibility.Public,
      vibration: true,
    })
  } catch {
    /* 已存在或系统不支持 */
  }
}

/** 取消全部待发通知，按当前配置重排未来 DAYS_AHEAD 天的喝水提醒。 */
export async function rescheduleMobile(config: Config, paused: boolean): Promise<void> {
  try {
    await cancelAll()
    if (paused) return
    if (!(await ensureNotifPermission())) return
    await ensureChannel()

    const enabled = config.alarms.filter((a) => a.enabled)
    if (enabled.length === 0) return

    const now = Date.now()
    let id = 1
    for (let d = 0; d < DAYS_AHEAD; d++) {
      for (const a of enabled) {
        const fire = new Date()
        fire.setHours(0, 0, 0, 0)
        fire.setDate(fire.getDate() + d)
        fire.setMinutes(hhmmToMinutes(a.time))
        if (fire.getTime() <= now + 5000) continue // 跳过已过去的
        sendNotification({
          id: id++,
          channelId: CHANNEL_ID,
          title: '该歇一下啦 🫗',
          body: config.prompt || '去喝水 · 起来拉伸',
          schedule: Schedule.at(fire, false, true), // 一次性 + allowWhileIdle(Doze 也响)
        })
      }
    }
  } catch (e) {
    console.warn('rescheduleMobile failed', e)
  }
}
