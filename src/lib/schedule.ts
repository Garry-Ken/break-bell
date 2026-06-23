import type { Alarm } from '../types'
import { minutesToHHMM } from './format'

/**
 * 均分模式：在 [startMin, endMin] 区间内放 count 个闹钟，含首尾端点。
 * step = (end-start)/(count-1)，所以第一个落在 start、最后一个落在 end。
 * 边界：count<=0 → []；count===1 → [start]；end<=start → [start]（退化，UI 会拦截）。
 */
export function computeEvenIntervals(startMin: number, endMin: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [startMin]
  if (endMin <= startMin) return [startMin]
  const step = (endMin - startMin) / (count - 1)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(Math.round(startMin + i * step))
  return dedupeSorted(out)
}

/**
 * 固定间隔模式：从 startMin 起每 stepMin 一个，直到超过 endMin 或达到 maxCount。
 * 边界：step<=0 → []。
 */
export function computeFixedInterval(
  startMin: number,
  stepMin: number,
  endMin: number,
  maxCount = 48,
): number[] {
  if (stepMin <= 0) return []
  const out: number[] = []
  for (let t = startMin; t <= endMin && out.length < maxCount; t += stepMin) out.push(Math.round(t))
  return dedupeSorted(out)
}

function dedupeSorted(mins: number[]): number[] {
  return [...new Set(mins.map((m) => ((Math.round(m) % 1440) + 1440) % 1440))].sort((a, b) => a - b)
}

let _seq = 0
function newId(): string {
  _seq += 1
  return `a${Date.now().toString(36)}${_seq.toString(36)}`
}

/** 把分钟数组转成 Alarm 列表（默认启用）。 */
export function buildAlarms(mins: number[]): Alarm[] {
  return mins.map((m) => ({ id: newId(), time: minutesToHHMM(m), enabled: true }))
}

/** 下一个将要响的闹钟（相对 nowMin，绕到次日），返回距今分钟数与该闹钟；无启用项返回 null。 */
export function nextAlarm(alarms: Alarm[], nowMin: number): { alarm: Alarm; inMin: number } | null {
  const enabled = alarms.filter((a) => a.enabled)
  if (enabled.length === 0) return null
  let best: { alarm: Alarm; inMin: number } | null = null
  for (const a of enabled) {
    const t = hhmm(a.time)
    let delta = t - nowMin
    if (delta < 0) delta += 1440 // 今天已过 → 明天
    if (!best || delta < best.inMin) best = { alarm: a, inMin: delta }
  }
  return best
}

function hhmm(s: string): number {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10))
  return (h || 0) * 60 + (m || 0)
}
