import { useEffect, useRef, useState } from 'react'
import type { Config } from './types'
import { loadConfig, saveConfig } from './store'
import {
  applySchedule,
  getStatus,
  onNavigate,
  onStatusChanged,
  setPaused as ipcSetPaused,
} from './lib/ipc'
import StatusBar from './components/StatusBar'
import SetupCard from './components/SetupCard'
import ScheduleList from './components/ScheduleList'
import SettingsPanel from './components/SettingsPanel'

type Tab = 'schedule' | 'settings'

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [paused, setPaused] = useState(false)
  const [tab, setTab] = useState<Tab>('schedule')
  const loadedOnce = useRef(false)

  // 初始加载
  useEffect(() => {
    ;(async () => {
      const c = await loadConfig()
      setConfig(c)
      const st = await getStatus()
      if (st) setPaused(st.paused)
    })()
  }, [])

  // 配置变更 → 持久化 + 同步给 Rust 调度器（跳过加载前）
  useEffect(() => {
    if (!config) return
    if (!loadedOnce.current) {
      loadedOnce.current = true
    }
    saveConfig(config)
    applySchedule(config)
  }, [config])

  // 托盘「暂停」会从 Rust 推送状态
  useEffect(() => {
    let unStatus: (() => void) | undefined
    let unNav: (() => void) | undefined
    onStatusChanged((s) => setPaused(s.paused)).then((f) => (unStatus = f))
    onNavigate((r) => r === 'settings' && setTab('settings')).then((f) => (unNav = f))
    return () => {
      unStatus?.()
      unNav?.()
    }
  }, [])

  const update = (patch: Partial<Config>) => setConfig((c) => (c ? { ...c, ...patch } : c))

  const togglePause = async () => {
    const p = !paused
    setPaused(p)
    await ipcSetPaused(p)
  }

  if (!config) {
    return <div className="grid h-full place-items-center text-ink-faint">加载中…</div>
  }

  return (
    <div className="mx-auto flex h-full max-w-[460px] flex-col px-4 pb-4 pt-5">
      {/* 头部 */}
      <header className="mb-4 flex items-center gap-2.5 px-1">
        <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-brand-500 text-white shadow-glow">
          <BellIcon />
        </div>
        <div className="leading-tight">
          <div className="text-[17px] font-semibold tracking-tight">歇钟</div>
          <div className="text-[11px] text-ink-faint">喝水 · 拉伸 · 强制休息</div>
        </div>
      </header>

      <StatusBar config={config} paused={paused} onTogglePause={togglePause} />

      {/* Tabs */}
      <div className="my-4 flex justify-center">
        <div className="seg">
          <button
            className={`seg-item ${tab === 'schedule' ? 'seg-item-on' : ''}`}
            onClick={() => setTab('schedule')}
          >
            日程
          </button>
          <button
            className={`seg-item ${tab === 'settings' ? 'seg-item-on' : ''}`}
            onClick={() => setTab('settings')}
          >
            设置
          </button>
        </div>
      </div>

      {/* 内容 */}
      <main className="scroll-thin flex-1 space-y-4 overflow-y-auto pb-2">
        {tab === 'schedule' ? (
          <>
            <SetupCard config={config} update={update} />
            <ScheduleList config={config} update={update} />
          </>
        ) : (
          <SettingsPanel config={config} update={update} />
        )}
      </main>
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.5c-3 0-5 2.1-5 5.2 0 3.1-.7 4.6-1.6 5.7-.5.6-.1 1.6.7 1.6h11.8c.8 0 1.2-1 .7-1.6-.9-1.1-1.6-2.6-1.6-5.7 0-3.1-2-5.2-5-5.2Z"
        fill="currentColor"
      />
      <path d="M10 19a2 2 0 0 0 4 0Z" fill="currentColor" />
    </svg>
  )
}
