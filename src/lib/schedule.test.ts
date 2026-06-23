import { describe, it, expect } from 'vitest'
import {
  computeCycle,
  computeEvenCycles,
  evenWorkMinutes,
  buildAlarms,
  nextAlarm,
} from './schedule'
import { minutesToHHMM } from './format'

describe('computeCycle（固定专注：工作→休息→工作）', () => {
  it('9:00 起 专注45+休息5，闹钟落在每段工作结束', () => {
    const r = computeCycle(540, 45, 5, 1320) // 9:00–22:00
    expect(minutesToHHMM(r[0])).toBe('09:45') // 第一次：9:00+45
    expect(minutesToHHMM(r[1])).toBe('10:35') // 休到9:50，再+45
    expect(minutesToHHMM(r[2])).toBe('11:25')
    // 相邻闹钟间隔 = 工作45 + 休息5 = 50 分
    for (let i = 1; i < r.length; i++) expect(r[i] - r[i - 1]).toBe(50)
    expect(r[r.length - 1]).toBeLessThanOrEqual(1320)
  })

  it('不在 start 立刻响（第一次是 start+work）', () => {
    const r = computeCycle(540, 45, 5, 1320)
    expect(r[0]).toBe(585)
    expect(r.includes(540)).toBe(false)
  })

  it('work<=0 → []，maxCount 生效', () => {
    expect(computeCycle(540, 0, 5, 1320)).toEqual([])
    expect(computeCycle(0, 10, 5, 1439, 6).length).toBe(6)
  })
})

describe('computeEvenCycles（均分：倒推工作时长铺满窗口）', () => {
  it('9:00–22:00 放 15 个周期，休息5 → 工作47', () => {
    const r = computeEvenCycles(540, 1320, 15, 5)
    expect(r.length).toBe(15)
    expect(minutesToHHMM(r[0])).toBe('09:47') // 9:00 + work(47)
    expect(minutesToHHMM(r[14])).toBe('21:55') // 末段休息恰好到 22:00
    expect(r[r.length - 1]).toBeLessThan(1320)
    // 相邻间隔 = 工作47 + 休息5 = 52
    for (let i = 1; i < r.length; i++) expect(r[i] - r[i - 1]).toBe(52)
  })

  it('窗口装不下这么多休息 → []', () => {
    expect(computeEvenCycles(540, 600, 20, 5)).toEqual([]) // 60 分钟塞 20×5 休息
  })

  it('count<=0 / end<=start → []', () => {
    expect(computeEvenCycles(540, 1320, 0, 5)).toEqual([])
    expect(computeEvenCycles(700, 600, 5, 5)).toEqual([])
  })
})

describe('evenWorkMinutes', () => {
  it('倒推工作时长', () => {
    expect(evenWorkMinutes(540, 1320, 15, 5)).toBe(47)
  })
  it('装不下返回 0', () => {
    expect(evenWorkMinutes(540, 600, 20, 5)).toBe(0)
  })
})

describe('buildAlarms', () => {
  it('生成唯一 id 且默认启用', () => {
    const a = buildAlarms([585, 635])
    expect(a.length).toBe(2)
    expect(a[0].time).toBe('09:45')
    expect(a[0].enabled).toBe(true)
    expect(a[0].id).not.toBe(a[1].id)
  })
})

describe('nextAlarm', () => {
  const alarms = buildAlarms([540, 720, 1320]) // 9:00 12:00 22:00
  it('选最近的未来项', () => {
    const r = nextAlarm(alarms, 600) // 10:00 → 12:00
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
