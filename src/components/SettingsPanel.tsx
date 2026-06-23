import { SOUNDS, type Config, type SoundName } from '../types'
import { playRing, previewBreak, setAutostart } from '../lib/ipc'
import { Switch, Stepper } from './ui'

export default function SettingsPanel({
  config,
  update,
}: {
  config: Config
  update: (patch: Partial<Config>) => void
}) {
  return (
    <div className="card divide-y divide-black/[0.06]">
      {/* 铃声 */}
      <div className="row px-4 py-3">
        <span className="text-[14px] text-ink-soft">铃声</span>
        <div className="flex items-center gap-2">
          <select
            className="field py-1.5 pr-7 text-[13px]"
            value={config.sound}
            onChange={(e) => update({ sound: e.target.value as SoundName })}
          >
            {SOUNDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost py-1.5 text-[12px]"
            onClick={() => playRing(config.sound, config.volume)}
          >
            试听
          </button>
        </div>
      </div>

      {/* 音量 */}
      <div className="row px-4 py-3">
        <span className="text-[14px] text-ink-soft">音量</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(config.volume * 100)}
          onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
          className="h-1.5 w-[150px] cursor-pointer accent-brand-500"
        />
      </div>

      {/* 休息时长 */}
      <div className="row px-4 py-3">
        <div>
          <div className="text-[14px] text-ink-soft">休息时长</div>
          <div className="text-[11px] text-ink-faint">到点后全屏遮罩持续的分钟数</div>
        </div>
        <Stepper
          value={config.breakMinutes}
          min={1}
          max={60}
          onChange={(v) => update({ breakMinutes: v })}
          suffix="分"
        />
      </div>

      {/* 提示语 */}
      <div className="px-4 py-3">
        <div className="mb-1.5 text-[14px] text-ink-soft">遮罩提示语</div>
        <input
          className="field w-full"
          value={config.prompt}
          maxLength={24}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="去喝水 · 起来拉伸"
        />
      </div>

      {/* 允许跳过 */}
      <div className="row px-4 py-3">
        <div>
          <div className="text-[14px] text-ink-soft">允许提前结束</div>
          <div className="text-[11px] text-ink-faint">遮罩上显示「跳过」按钮</div>
        </div>
        <Switch on={config.allowSkip} onChange={(v) => update({ allowSkip: v })} />
      </div>

      {/* 系统锁屏 */}
      <div className="row px-4 py-3">
        <div className="pr-3">
          <div className="text-[14px] text-ink-soft">同时锁定系统</div>
          <div className="text-[11px] text-ink-faint">
            到点直接锁屏（替代遮罩）；需用密码/指纹解锁
          </div>
        </div>
        <Switch on={config.osLock} onChange={(v) => update({ osLock: v })} />
      </div>

      {/* 开机自启 */}
      <div className="row px-4 py-3">
        <span className="text-[14px] text-ink-soft">开机自启</span>
        <Switch
          on={config.autostart}
          onChange={async (v) => {
            update({ autostart: v })
            await setAutostart(v)
          }}
        />
      </div>

      {/* 预览 */}
      <div className="px-4 py-3">
        <button
          className="btn-ghost w-full justify-center py-2.5"
          onClick={() => previewBreak(Math.min(15, config.breakMinutes * 60), config.prompt, true)}
        >
          预览休息遮罩（15 秒）
        </button>
      </div>
    </div>
  )
}
