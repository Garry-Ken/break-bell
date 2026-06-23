import type { Alarm, Config } from '../types'
import { Switch } from './ui'

export default function ScheduleList({
  config,
  update,
}: {
  config: Config
  update: (patch: Partial<Config>) => void
}) {
  const alarms = config.alarms

  const setAlarm = (id: string, patch: Partial<Alarm>) =>
    update({ alarms: alarms.map((a) => (a.id === id ? { ...a, ...patch } : a)) })

  const removeAlarm = (id: string) => update({ alarms: alarms.filter((a) => a.id !== id) })

  const addAlarm = () => {
    const id = `a${Date.now().toString(36)}`
    const next = [...alarms, { id, time: '12:00', enabled: true }].sort((a, b) =>
      a.time.localeCompare(b.time),
    )
    update({ alarms: next })
  }

  const clearAll = () => update({ alarms: [] })

  const enabledCount = alarms.filter((a) => a.enabled).length

  if (alarms.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 px-4 py-10 text-center">
        <div className="text-[28px]">🫗</div>
        <div className="text-[14px] font-medium text-ink-soft">还没有闹钟</div>
        <div className="text-[12px] text-ink-faint">在上方设定时段，一键铺满一天的喝水提醒</div>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="row border-b border-black/[0.06] px-4 py-2.5">
        <span className="text-[12px] text-ink-mute">
          {alarms.length} 个闹钟 · {enabledCount} 个启用
        </span>
        <div className="flex items-center gap-2">
          <button className="btn-ghost py-1.5 text-[12px]" onClick={addAlarm}>
            + 添加
          </button>
          <button
            className="rounded-full px-3 py-1.5 text-[12px] font-medium text-rose-500 hover:bg-rose-50"
            onClick={clearAll}
          >
            清空
          </button>
        </div>
      </div>
      <div className="scroll-thin max-h-[260px] divide-y divide-black/[0.05] overflow-y-auto">
        {alarms
          .slice()
          .sort((a, b) => a.time.localeCompare(b.time))
          .map((a) => (
            <div key={a.id} className="row px-4 py-2.5">
              <input
                type="time"
                value={a.time}
                onChange={(e) => setAlarm(a.id, { time: e.target.value })}
                className={`field w-[108px] py-1.5 text-[15px] font-semibold tabular-nums ${
                  a.enabled ? '' : 'text-ink-faint line-through'
                }`}
              />
              <div className="flex items-center gap-3">
                <Switch on={a.enabled} onChange={(v) => setAlarm(a.id, { enabled: v })} />
                <button
                  className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-black/[0.06] hover:text-rose-500"
                  onClick={() => removeAlarm(a.id)}
                  title="删除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
