import type { Alarm } from '../types'
import { minutesToHHMM } from './format'

/**
 * 周期/番茄钟模型：工作 workMin → 休息 breakMin → 工作 …
 * 闹钟落在每段工作结束(=休息开始)的时刻；下一段工作从「上一段休息结束」再算 workMin。
 * 例：start=9:00, work=45, break=5 → 9:45(休到9:50), 10:35(休到10:40), 11:25 …
 *
 * 固定专注模式：从 startMin 起一直循环，直到下一个闹钟会超过 endMin，或达到 maxCount。
 * 边界：workMin<=0 → []。
 */
export function computeCycle(
  startMin: number,
  workMin: number,
  breakMin: number,
  endMin: number,
  maxCount = 48,
): number[] {
  if (workMin <= 0) return []
  const out: number[] = []
  let t = startMin
  while (out.length < maxCount) {
    t += workMin // 一段工作结束 → 该休息了
    if (t > endMin) break
    out.push(Math.round(t))
    t += breakMin // 休息结束 → 下一段工作开始
  }
  return dedupeSorted(out)
}

/**
 * 均分模式：在 [start,end] 内放 count 个「工作+休息」周期，自动倒推工作时长，
 * 使 count 段工作 + count 段休息正好铺满窗口。
 * work = (window - count*break) / count；work<=0(窗口装不下) → []。
 */
export function computeEvenCycles(
  startMin: number,
  endMin: number,
  count: number,
  breakMin: number,
): number[] {
  if (count <= 0 || endMin <= startMin) return []
  const work = (endMin - startMin - count * breakMin) / count
  if (work <= 0) return []
  const out: number[] = []
  let t = startMin
  for (let i = 0; i < count; i++) {
    t += work
    out.push(Math.round(t))
    t += breakMin
  }
  return dedupeSorted(out)
}

/** 均分模式倒推出的工作时长（分钟），UI 用于展示；装不下返回 0。 */
export function evenWorkMinutes(
  startMin: number,
  endMin: number,
  count: number,
  breakMin: number,
): number {
  if (count <= 0 || endMin <= startMin) return 0
  return Math.max(0, Math.round((endMin - startMin - count * breakMin) / count))
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
