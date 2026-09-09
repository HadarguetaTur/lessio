import { describe, it, expect } from 'vitest'
import { isGoodLuckDue, targetHour } from './goodLuckTiming'

const base = { morningHour: 7, hoursBefore: 2 }

describe('targetHour', () => {
  it('uses the morning hour when the exam has no time', () => {
    expect(targetHour({ ...base, examTime: null })).toBe(7)
  })

  it('subtracts hoursBefore from a known exam time', () => {
    expect(targetHour({ ...base, examTime: '12:00' })).toBe(10)
  })

  it('never lands before the morning hour', () => {
    // 07:30 exam minus 2h would be 05:30 — clamped to the morning hour.
    expect(targetHour({ ...base, examTime: '07:30' })).toBe(7)
    expect(targetHour({ ...base, examTime: '08:00' })).toBe(7)
  })

  it('accepts the HH:MM:SS form Postgres returns for a time column', () => {
    expect(targetHour({ ...base, examTime: '12:00:00' })).toBe(10)
  })

  it('treats an unparseable time as no time', () => {
    expect(targetHour({ ...base, examTime: 'soon' })).toBe(7)
  })
})

describe('isGoodLuckDue', () => {
  it('is not due before the morning hour', () => {
    expect(isGoodLuckDue({ ...base, examTime: null, nowHour: 6 })).toBe(false)
  })

  it('is due at the morning hour when the exam has no time', () => {
    expect(isGoodLuckDue({ ...base, examTime: null, nowHour: 7 })).toBe(true)
  })

  it('stays due later in the day when a run was missed', () => {
    // The claim in notification_log is what stops a second send, not the hour.
    expect(isGoodLuckDue({ ...base, examTime: null, nowHour: 15 })).toBe(true)
  })

  it('is due hoursBefore a known exam time, not earlier', () => {
    expect(isGoodLuckDue({ ...base, examTime: '12:00', nowHour: 9 })).toBe(false)
    expect(isGoodLuckDue({ ...base, examTime: '12:00', nowHour: 10 })).toBe(true)
    expect(isGoodLuckDue({ ...base, examTime: '12:00', nowHour: 11 })).toBe(true)
  })

  it('stops once the exam has started', () => {
    expect(isGoodLuckDue({ ...base, examTime: '12:00', nowHour: 12 })).toBe(false)
    expect(isGoodLuckDue({ ...base, examTime: '12:00', nowHour: 18 })).toBe(false)
  })

  it('still sends for an early exam once the morning hour arrives', () => {
    expect(isGoodLuckDue({ ...base, examTime: '08:00', nowHour: 6 })).toBe(false)
    expect(isGoodLuckDue({ ...base, examTime: '08:00', nowHour: 7 })).toBe(true)
  })

  it('sends nothing for an exam that starts before the morning hour', () => {
    // Target clamps to 07:00 but the exam is already under way by then.
    expect(isGoodLuckDue({ ...base, examTime: '06:00', nowHour: 7 })).toBe(false)
  })

  it('honours a different org configuration', () => {
    const early = { morningHour: 6, hoursBefore: 3 }
    expect(isGoodLuckDue({ ...early, examTime: '14:00', nowHour: 10 })).toBe(false)
    expect(isGoodLuckDue({ ...early, examTime: '14:00', nowHour: 11 })).toBe(true)
  })
})
