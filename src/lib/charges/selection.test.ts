import { describe, expect, it } from 'vitest'
import {
  retainOnly,
  selectAllState,
  summarize,
  toggleAllOf,
  toggleSelection,
  type SelectedCharge,
} from './selection'

function charge(id: string, parentId: string, remaining: number, hasPhone = true): SelectedCharge {
  return { chargeId: id, parentId, parentName: `parent ${parentId}`, parentHasPhone: hasPhone, remaining }
}

const a1 = charge('c1', 'p1', 250)
const a2 = charge('c2', 'p1', 175.5)
const b1 = charge('c3', 'p2', 100, false)

function selectionOf(...rows: SelectedCharge[]) {
  return new Map(rows.map((r) => [r.chargeId, r]))
}

describe('toggleSelection', () => {
  it('adds a row that is not selected and removes one that is', () => {
    const once = toggleSelection(new Map(), a1)
    expect([...once.keys()]).toEqual(['c1'])
    expect([...toggleSelection(once, a1).keys()]).toEqual([])
  })
})

describe('toggleAllOf', () => {
  it('selects every row when some are unselected', () => {
    const next = toggleAllOf(selectionOf(a1), [a1, a2])
    expect([...next.keys()].sort()).toEqual(['c1', 'c2'])
  })

  it('clears them once all are selected', () => {
    expect([...toggleAllOf(selectionOf(a1, a2), [a1, a2]).keys()]).toEqual([])
  })

  it('leaves rows outside the group untouched', () => {
    const next = toggleAllOf(selectionOf(b1, a1, a2), [a1, a2])
    expect([...next.keys()]).toEqual(['c3'])
  })
})

describe('retainOnly', () => {
  it('drops what the current filter no longer shows', () => {
    expect([...retainOnly(selectionOf(a1, a2, b1), ['c1', 'c3']).keys()]).toEqual(['c1', 'c3'])
  })
})

describe('selectAllState', () => {
  it.each([
    [selectionOf(), 'none'],
    [selectionOf(a1), 'some'],
    [selectionOf(a1, a2), 'all'],
  ] as const)('reports %#', (selection, expected) => {
    expect(selectAllState(selection, [a1, a2])).toBe(expected)
  })

  it('is "none" when there is nothing selectable', () => {
    expect(selectAllState(selectionOf(a1), [])).toBe('none')
  })
})

describe('summarize', () => {
  it('totals the selection and groups it per parent', () => {
    const summary = summarize(selectionOf(a1, a2, b1))
    expect(summary.count).toBe(3)
    expect(summary.total).toBe(525.5)
    expect(summary.parents).toEqual([
      { parentId: 'p1', parentName: 'parent p1', parentHasPhone: true, amount: 425.5 },
      { parentId: 'p2', parentName: 'parent p2', parentHasPhone: false, amount: 100 },
    ])
  })

  it('reports whether anyone can be messaged at all', () => {
    expect(summarize(selectionOf(a1, b1)).anyPhone).toBe(true)
    expect(summarize(selectionOf(b1)).anyPhone).toBe(false)
  })

  it('is empty for an empty selection', () => {
    expect(summarize(new Map())).toEqual({ count: 0, total: 0, parents: [], anyPhone: false })
  })
})
