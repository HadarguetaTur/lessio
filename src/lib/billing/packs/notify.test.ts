import { describe, expect, it } from 'vitest'
import { packBalanceStage } from './notify'

describe('packBalanceStage', () => {
  const none = { low: false, exhausted: false }

  it('says nothing above the threshold', () => {
    expect(packBalanceStage(5, 2, none)).toBeNull()
  })

  it('warns once at or below the threshold', () => {
    expect(packBalanceStage(2, 2, none)).toBe('pack_low_balance')
    expect(packBalanceStage(1, 2, { low: true, exhausted: false })).toBeNull()
  })

  it('reports a used-up card even after the low warning, but only once', () => {
    expect(packBalanceStage(0, 2, { low: true, exhausted: false })).toBe('pack_exhausted')
    expect(packBalanceStage(0, 2, { low: true, exhausted: true })).toBeNull()
  })

  it('a threshold of 0 means only the used-up message', () => {
    expect(packBalanceStage(1, 0, none)).toBeNull()
    expect(packBalanceStage(0, 0, none)).toBe('pack_exhausted')
  })
})
