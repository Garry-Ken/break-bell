import { useMemo } from 'react'
import type { Config } from '../types'
import { computeEvenCycles, computeCycle, evenWorkMinutes, buildAlarms } from '../lib/schedule'
import { hhmmToMinutes, minutesToHHMM } from '../lib/format'
import { Stepper } from './ui'

export default function SetupCard({
  config,
  update,
}: {
  config: Config
  update: (patch: Partial<Config>) => void
}) {
  const startMin = hhmmToMinutes(config.windowStart)
  const endMin = hhmmToMinutes(config.windowEnd)
  const brk = config.breakMinutes
  const windowOk = endMin > startMin

  // 倒推/采用的工作(专注)时长，用于展示循环
  const workMin = useMemo(() => {
    if (config.mode === 'even') return evenWorkMinutes(startMin, endMin, config.count, brk)
    return config.intervalMin
  }, [config.mode, startMin, endMin, config.count, config.intervalMin, brk])

  const preview = useMemo(() => {
    if (config.mode === 'even') return computeEvenCycles(startMin, endMin, config.count, brk)
    return computeCycle(startMin, config.intervalMin, brk, endMin)
  }, [config.mode, startMin, endMin, config.count, config.intervalMin, brk])

  const valid = windowOk && preview.length > 0
  const tooTight = windowOk && config.mode === 'even' && workMin <= 0

  const apply = () => {
    if (!valid) return
    update({ alarms: buildAlarms(preview) })
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="seg">
          <button
            className={`seg-item ${config.mode === 'even' ? 'seg-item-on' : ''}`}
            onClick={() => update({ mode: 'even' })}
          >
            均分时段
          </button>
          <button
            className={`seg-item ${config.mode === 'fixed' ? 'seg-item-on' : ''}`}
            onClick={() => update({ mode: 'fixed' })}
          >
            固定专注
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="px-1 text-[12px] text-ink-mute">开始</span>
          <input
            type="time"
            className="field"
            value={config.windowStart}
            onChange={(e) => update({ windowStart: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="px-1 text-[12px] text-ink-mute">结束</span>
          <input
            type="time"
            className="field"
            value={config.windowEnd}
            onChange={(e) => update({ windowEnd: e.target.value })}
          />
        </label>
      </div>

      <div className="row mt-3 px-1">
        {config.mode === 'even' ? (
          <>
            <span className="text-[14px] text-ink-soft">闹钟数量</span>
            <Stepper
              value={config.count}
              min={1}
              max={48}
              onChange={(v) => update({ count: v })}
              suffix="个"
            />
          </>
        ) : (
          <>
            <span className="text-[14px] text-ink-soft">专注时长</span>
            <Stepper
              value={config.intervalMin}
              min={5}
              max={180}
              step={5}
              onChange={(v) => update({ intervalMin: v })}
              suffix="分"
            />
          </>
        )}
      </div>

      {/* 循环说明：工作 → 休息 → 工作 */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[12px] text-brand-700">
        <span>🍅</span>
        <span>
          专注 <b>{workMin > 0 ? workMin : '—'}</b> 分 → 休息 <b>{brk}</b> 分 → 再专注，循环。
          <span className="text-brand-700/60">（休息时长在「设置」里调）</span>
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-[12px] text-ink-faint">
          {!windowOk ? (
            <span className="text-rose-500">结束时间需晚于开始时间</span>
          ) : tooTight ? (
            <span className="text-rose-500">这个时段放不下 {config.count} 次休息，减少数量</span>
          ) : preview.length === 0 ? (
            <span className="text-rose-500">时段太短，放不下一个循环</span>
          ) : (
            <>
              将生成 <span className="font-semibold text-ink-soft">{preview.length}</span> 个闹钟 · 第一次{' '}
              {minutesToHHMM(preview[0])}、末次 {minutesToHHMM(preview[preview.length - 1])}
            </>
          )}
        </div>
        <button className="btn-primary" disabled={!valid} onClick={apply}>
          {config.mode === 'even' ? `一键设 ${config.count} 个闹钟` : '一键生成'}
        </button>
      </div>
    </div>
  )
}
