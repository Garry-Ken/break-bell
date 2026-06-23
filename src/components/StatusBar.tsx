import { useEffect, useState } from 'react'
import type { Config } from '../types'
import { nextAlarm } from '../lib/schedule'
import { formatCountdown } from '../lib/format'

export default function StatusBar({
  config,
  paused,
  onTogglePause,
}: {
  config: Config
  paused: boolean
  onTogglePause: () => void
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const next = nextAlarm(config.alarms, nowMin)
  // 距下一次的秒数（用整分差 - 当前秒，得到平滑倒计时）
  const secsToNext = next ? Math.max(0, next.inMin * 60 - now.getSeconds()) : 0

  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 shadow-apple backdrop-blur">
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            paused ? 'bg-ink-faint' : 'animate-pulse bg-emerald-500'
          }`}
        />
        <div className="leading-tight">
          {next && !paused ? (
            <>
              <div className="text-[12px] text-ink-mute">下一次 {next.alarm.time} · 还有</div>
              <div className="text-[22px] font-semibold tabular-nums tracking-tight">
                {formatCountdown(secsToNext)}
              </div>
            </>
          ) : (
            <>
              <div className="text-[12px] text-ink-mute">{paused ? '已暂停' : '没有启用的闹钟'}</div>
              <div className="text-[18px] font-semibold text-ink-soft">
                {paused ? '闹钟不会响' : '去上面设几个吧'}
              </div>
            </>
          )}
        </div>
      </div>
      <button
        className={`rounded-full px-4 py-2 text-[13px] font-semibold transition active:scale-95 ${
          paused
            ? 'bg-brand-500 text-white hover:bg-brand-600'
            : 'bg-black/[0.05] text-ink-soft hover:bg-black/[0.09]'
        }`}
        onClick={onTogglePause}
      >
        {paused ? '恢复' : '暂停'}
      </button>
    </div>
  )
}
