import { useEffect, useMemo, useRef, useState } from 'react'
import CountdownRing from './CountdownRing'
import { formatCountdown } from '../../lib/format'
import { skipBreak, inTauri } from '../../lib/ipc'

const TIPS = [
  '站起来，接一杯水 🫗',
  '远眺窗外 20 秒，放松眼睛 👀',
  '转转脖子和肩膀，拉伸一下 🧎',
  '深呼吸三次，慢慢吐气 🌬️',
  '走几步，活动活动腿脚 🚶',
]

async function closeSelf() {
  if (!inTauri) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch {
    /* 已关闭 */
  }
}

/** 桌面：独立窗口(读 query)；移动端：作为 App 内全屏遮罩(传 props + onClose)。 */
export default function OverlayRoot({
  secs,
  prompt: promptProp,
  allowSkip: allowSkipProp,
  onClose,
}: {
  secs?: number
  prompt?: string
  allowSkip?: boolean
  onClose?: () => void
} = {}) {
  const params = new URLSearchParams(location.search)
  const total = useMemo(
    () => Math.max(1, secs ?? parseInt(params.get('secs') || '300', 10)),
    [secs],
  )
  const allowSkip = allowSkipProp ?? params.get('skip') === '1'
  const prompt = promptProp ?? decodeURIComponent(params.get('prompt') || '去喝水 · 起来拉伸')

  const [remaining, setRemaining] = useState(total)
  const [tip, setTip] = useState(0)
  const deadline = useRef(Date.now() + total * 1000)

  const finish = () => {
    if (onClose) onClose() // App 内模式
    else closeSelf() // 独立窗口模式（Rust 也会权威关闭，这里兜底）
  }

  // 用绝对截止时间驱动，避免后台节流导致的漂移
  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.round((deadline.current - Date.now()) / 1000)
      setRemaining(left)
      if (left <= 0) {
        clearInterval(t)
        finish()
      }
    }, 250)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="fixed inset-0 flex select-none flex-col items-center justify-center overflow-hidden bg-[#0b1020] text-white">
      {/* 柔和光晕背景 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/20 blur-[120px] animate-breathe" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-9 px-8">
        <div className="text-center">
          <div className="text-[13px] uppercase tracking-[0.3em] text-white/40">休息一下</div>
          <h1 className="mt-3 text-[34px] font-semibold tracking-tight">{prompt}</h1>
        </div>

        <CountdownRing remaining={remaining} total={total} label={formatCountdown(remaining)} />

        <div className="h-6 text-[16px] text-white/55 transition-all">{TIPS[tip]}</div>

        {allowSkip ? (
          <button
            onClick={() => {
              if (onClose) onClose()
              else {
                skipBreak()
                closeSelf()
              }
            }}
            className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-[14px] font-medium text-white/70 transition hover:bg-white/10 active:scale-95"
          >
            跳过这次休息
          </button>
        ) : (
          <div className="text-[13px] text-white/30">坚持一下，对身体好 💪</div>
        )}
      </div>
    </div>
  )
}
