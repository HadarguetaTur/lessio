import { describe, it, expect } from 'vitest'
import { flagInFileDuplicates } from './detectDuplicates'
import type { ValidatedRow } from './validators'

function row(rowIndex: number, data: Record<string, string>): ValidatedRow {
  return { rowIndex, status: 'valid', data, errors: [], warnings: [] }
}

const message = (n: number) => `duplicate of row ${n}`

describe('flagInFileDuplicates', () => {
  it('keeps the first occurrence and flags the repeat, naming the row it repeats', () => {
    const rows = [
      row(0, { phone: '0501234567' }), // file row 2
      row(1, { phone: '0509999999' }),
      row(2, { phone: '0501234567' }), // file row 4 — repeats row 2
    ]

    const out = flagInFileDuplicates(rows, (r) => r.data.phone, 'error', message)

    expect(out[0].status).toBe('valid')
    expect(out[1].status).toBe('valid')
    expect(out[2].status).toBe('error')
    expect(out[2].errors).toEqual(['duplicate of row 2'])
  })

  it('flags a third occurrence against the first, not the second', () => {
    const rows = [row(0, { phone: '05' }), row(2, { phone: '05' }), row(5, { phone: '05' })]
    const out = flagInFileDuplicates(rows, (r) => r.data.phone, 'error', message)
    expect(out[1].errors).toEqual(['duplicate of row 2'])
    expect(out[2].errors).toEqual(['duplicate of row 2'])
  })

  it('warns rather than refuses when the key can legitimately repeat', () => {
    const rows = [row(0, { full_name: 'דנה כהן' }), row(1, { full_name: 'דנה כהן' })]
    const out = flagInFileDuplicates(rows, (r) => r.data.full_name, 'warning', message)

    expect(out[1].status).toBe('warning')
    expect(out[1].warnings).toEqual(['duplicate of row 2'])
    // A warning row still imports — two students really can share a name.
    expect(out[1].errors).toEqual([])
  })

  it('ignores rows with no usable key', () => {
    const rows = [row(0, { phone: '' }), row(1, { phone: '' })]
    const out = flagInFileDuplicates(rows, (r) => r.data.phone || null, 'error', message)
    expect(out.every((r) => r.status === 'valid')).toBe(true)
  })

  it('treats siblings as distinct when the key includes the student', () => {
    // The same parent phone on two rows is a family, not a duplicate.
    const rows = [
      row(0, { parent_phone: '0501234567', student_name: 'דנה' }),
      row(1, { parent_phone: '0501234567', student_name: 'יובל' }),
      row(2, { parent_phone: '0501234567', student_name: 'דנה' }),
    ]

    const out = flagInFileDuplicates(
      rows,
      (r) => `${r.data.parent_phone}|${r.data.student_name}`,
      'error',
      message
    )

    expect(out[0].status).toBe('valid')
    expect(out[1].status).toBe('valid') // the sibling
    expect(out[2].status).toBe('error') // the actual repeat
  })

  it('does not downgrade a row that was already an error', () => {
    const invalid: ValidatedRow = {
      rowIndex: 1,
      status: 'error',
      data: { full_name: 'דנה כהן' },
      errors: ['missing phone'],
      warnings: [],
    }
    const out = flagInFileDuplicates(
      [row(0, { full_name: 'דנה כהן' }), invalid],
      (r) => r.data.full_name,
      'warning',
      message
    )
    expect(out[1].status).toBe('error')
    expect(out[1].errors).toEqual(['missing phone'])
  })
})
