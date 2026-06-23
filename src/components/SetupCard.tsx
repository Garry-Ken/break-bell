import { useMemo } from 'react'
import type { Config } from '../types'
import { computeEvenIntervals, computeFixedInterval, buildAlarms } from '../lib/schedule'
import { hhmmToMinutes } from '../lib/format'
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
  const valid = endMin > startMin

  const preview = useMemo(() => {
    if (config.mode === 'even') return computeEvenIntervals(startMin, endMin, config.count)
    return computeFixedInterval(startMin, config.intervalMin, endMin)
  }, [config.mode, startMin, endMin, config.count, config.intervalMin])

  const apply = () => {
    if (!valid) return
    update({ alarms: buildAlarms(preview) })
  }

  const gapText = useMemo(() => {
    if (preview.length < 2) return ''
    const gap = Math.round((preview[preview.length - 1] - preview[0]) / (preview.length - 1))
    return `约每 ${gap} 分钟一次`
  }, [preview])

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
            固定间隔
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
            <span className="text-[14px] text-ink-soft">间隔时长</span>
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

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-[12px] text-ink-faint">
          {valid ? (
            <>
              将生成 <span className="font-semibold text-ink-soft">{preview.length}</span> 个闹钟
              {gapText ? ` · ${gapText}` : ''}
            </>
          ) : (
            <span className="text-rose-500">结束时间需晚于开始时间</span>
          )}
        </div>
        <button className="btn-primary" disabled={!valid || preview.length === 0} onClick={apply}>
          {config.mode === 'even' ? `一键设 ${config.count} 个闹钟` : '一键生成'}
        </button>
      </div>
    </div>
  )
}
