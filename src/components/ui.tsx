export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="switch"
      data-on={on}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    />
  )
}

export function Stepper({
  value,
  min = 1,
  max = 99,
  step = 1,
  onChange,
  suffix,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
  suffix?: string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        className="h-8 w-8 rounded-full bg-black/[0.05] text-ink-soft text-lg leading-none hover:bg-black/[0.09] active:scale-95 disabled:opacity-30"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <div className="min-w-[3.5rem] text-center text-[15px] font-semibold tabular-nums">
        {value}
        {suffix ? <span className="ml-0.5 text-[12px] font-normal text-ink-mute">{suffix}</span> : null}
      </div>
      <button
        type="button"
        className="h-8 w-8 rounded-full bg-black/[0.05] text-ink-soft text-lg leading-none hover:bg-black/[0.09] active:scale-95 disabled:opacity-30"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  )
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-mute">{children}</h2>
      {hint ? <span className="text-[11px] text-ink-faint">{hint}</span> : null}
    </div>
  )
}
