import { describe, it, expect } from 'vitest'
import { buildChargeLines } from './chargeLines'
import type { PaymentRequestCharge } from './index'

const charges: PaymentRequestCharge[] = [
  {
    id: 'charge-1',
    amount: 100,
    charge_type: 'lesson',
    lesson_start_at: '2026-01-05T14:00:00.000Z',
    student_name: 'ישראל ישראלי',
  },
  {
    id: 'charge-2',
    amount: 50,
    charge_type: 'cancellation',
    lesson_start_at: null,
    student_name: 'רבקה לוי',
  },
]

const he = { timezone: 'Asia/Jerusalem', locale: 'he' as const }
const en = { timezone: 'Asia/Jerusalem', locale: 'en' as const }

describe('buildChargeLines', () => {
  it('starts with a newline so a template can splice it mid-line', () => {
    expect(buildChargeLines(charges, he).startsWith('\n')).toBe(true)
  })

  it('lists every charge with its amount', () => {
    const block = buildChargeLines(charges, he)
    expect(block).toContain('100.00')
    expect(block).toContain('50.00')
  })

  it('includes the student name on each line', () => {
    const block = buildChargeLines(charges, he)
    expect(block).toContain('ישראל ישראלי')
    expect(block).toContain('רבקה לוי')
  })

  it('ends with the total', () => {
    const block = buildChargeLines(charges, he)
    expect(block).toContain('סה״כ לתשלום')
    expect(block).toContain('150.00')
  })

  it('uses Hebrew charge-type labels', () => {
    const block = buildChargeLines(charges, he)
    expect(block).toContain('שיעור')
    expect(block).toContain('חיוב ביטול')
  })

  it('uses English charge-type labels for an English recipient', () => {
    const block = buildChargeLines(charges, en)
    expect(block).toContain('Lesson')
    expect(block).toContain('Cancellation charge')
    expect(block).toContain('Total due')
    // The old private table leaked Hebrew into English messages; the bot string
    // table is the whole point of the move.
    expect(block).not.toContain('סה״כ')
  })

  it('labels manual and monthly charges', () => {
    const mixed: PaymentRequestCharge[] = [
      { id: 'c3', amount: 200, charge_type: 'manual', lesson_start_at: null, student_name: null },
      { id: 'c4', amount: 320, charge_type: 'monthly', lesson_start_at: null, student_name: null },
    ]
    const block = buildChargeLines(mixed, he)
    expect(block).toContain('חיוב ידני')
    expect(block).toContain('חיוב חודשי')
    expect(block).toContain('200.00')
    expect(block).toContain('320.00')
  })

  it('renders a lesson date in the recipient timezone', () => {
    // 14:00Z on 5 Jan is still 5 Jan in Asia/Jerusalem.
    expect(buildChargeLines(charges, he)).toContain('5')
  })

  it('is empty for a single charge — the body already names the amount', () => {
    expect(buildChargeLines([charges[0]], he)).toBe('')
  })

  it('is empty for no charges', () => {
    expect(buildChargeLines([], he)).toBe('')
  })

  it('formats money in the org currency, not a hardcoded shekel', () => {
    const block = buildChargeLines(charges, { ...en, currency: 'USD' })
    expect(block).toContain('$')
    expect(block).not.toContain('₪')
  })
})
