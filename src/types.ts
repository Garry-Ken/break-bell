export type ScheduleMode = 'even' | 'fixed'
export type SoundName = 'chime' | 'bell' | 'drop'

export interface Alarm {
  id: string
  time: string // "HH:MM" 24h
  enabled: boolean
}

export interface Config {
  alarms: Alarm[]
  // 生成参数（持久化，便于 UI 恢复）
  mode: ScheduleMode
  windowStart: string // "HH:MM"
  windowEnd: string // "HH:MM"
  count: number
  intervalMin: number // 固定间隔模式
  // 休息行为
  breakMinutes: number
  sound: SoundName
  volume: number // 0..1
  allowSkip: boolean
  osLock: boolean
  prompt: string
  autostart: boolean
}

export interface Status {
  paused: boolean
  breakActive: boolean
}

export const DEFAULT_CONFIG: Config = {
  alarms: [],
  mode: 'even',
  windowStart: '09:00',
  windowEnd: '22:00',
  count: 15,
  intervalMin: 45,
  breakMinutes: 5,
  sound: 'chime',
  volume: 0.8,
  allowSkip: true,
  osLock: false,
  prompt: '去喝水 · 起来拉伸',
  autostart: false,
}

export const SOUNDS: { id: SoundName; label: string }[] = [
  { id: 'chime', label: '清铃' },
  { id: 'bell', label: '钟声' },
  { id: 'drop', label: '水滴' },
]
