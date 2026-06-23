export default function CountdownRing({
  remaining,
  total,
  label,
}: {
  remaining: number // 秒
  total: number // 秒
  label: string
}) {
  const size = 260
  const stroke = 10
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0
  const dash = circ * frac

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#g)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.95s linear' }}
        />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4a93ff" />
            <stop offset="100%" stopColor="#0a84ff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <div className="text-[64px] font-semibold leading-none tabular-nums text-white">{label}</div>
        <div className="mt-2 text-[13px] uppercase tracking-[0.2em] text-white/40">剩余</div>
      </div>
    </div>
  )
}
