import { describe, it, expect } from 'vitest'
import { computeEvenIntervals, computeFixedInterval, buildAlarms, nextAlarm } from './schedule'
import { minutesToHHMM } from './format'

describe('computeEvenIntervals', () => {
  it('15 个闹钟落在 9:00–22:00，含首尾', () => {
    const r = computeEvenIntervals(540, 1320, 15)
    expect(r.length).toBe(15)
    expect(r[0]).toBe(540) // 09:00
    expect(r[r.length - 1]).toBe(1320) // 22:00
    expect(minutesToHHMM(r[0])).toBe('09:00')
    expect(minutesToHHMM(r[14])).toBe('22:00')
    // 单调递增
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1])
  })

  it('count=1 只在 start', () => {
    expect(computeEvenIntervals(540, 1320, 1)).toEqual([540])
  })

  it('count<=0 返回空', () => {
    expect(computeEvenIntervals(540, 1320, 0)).toEqual([])
    expect(computeEvenIntervals(540, 1320, -3)).toEqual([])
  })

  it('end<=start 退化为单点（仅作兜底，UI 会拦截无效区间）', () => {
    expect(computeEvenIntervals(600, 600, 5)).toEqual([600])
    expect(computeEvenIntervals(700, 600, 5)).toEqual([700])
  })

  it('窗口短于数量时去重，不产生重复时刻', () => {
    const r = computeEvenIntervals(600, 603, 10) // 只有 4 个不同分钟
    expect(new Set(r).size).toBe(r.length)
    expect(r.every((m) => m >= 600 && m <= 603)).toBe(true)
  })
})

describe('computeFixedInterval', () => {
  it('从 9:00 每 45 分钟到 12:00', () => {
    const r = computeFixedInterval(540, 45, 720)
    expect(r).toEqual([540, 585, 630, 675, 720])
  })
  it('step<=0 返回空', () => {
    expect(computeFixedInterval(540, 0, 720)).toEqual([])
  })
  it('受 maxCount 限制', () => {
    const r = computeFixedInterval(0, 1, 1439, 10)
    expect(r.length).toBe(10)
  })
})

describe('buildAlarms', () => {
  it('生成唯一 id 且默认启用', () => {
    const a = buildAlarms([540, 600])
    expect(a.length).toBe(2)
    expect(a[0].time).toBe('09:00')
    expect(a[0].enabled).toBe(true)
    expect(a[0].id).not.toBe(a[1].id)
  })
})

describe('nextAlarm', () => {
  const alarms = buildAlarms([540, 720, 1320]) // 9:00 12:00 22:00
  it('选最近的未来项', () => {
    const r = nextAlarm(alarms, 600) // 10:00 → 下一个 12:00
    expect(r?.alarm.time).toBe('12:00')
    expect(r?.inMin).toBe(120)
  })
  it('全部已过 → 绕到次日最早', () => {
    const r = nextAlarm(alarms, 1400) // 23:20 → 明天 9:00
    expect(r?.alarm.time).toBe('09:00')
    expect(r?.inMin).toBe(540 + 1440 - 1400) // = 580
  })
  it('无启用项返回 null', () => {
    expect(nextAlarm([], 600)).toBeNull()
  })
})
