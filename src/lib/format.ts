export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10))
  return (h || 0) * 60 + (m || 0)
}

export function minutesToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** 倒计时 mm:ss / h:mm:ss */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 人类可读时长，如「1 小时 23 分」「45 分钟」 */
export function formatDuration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin))
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm === 0 ? `${h} 小时` : `${h} 小时 ${mm} 分`
}
