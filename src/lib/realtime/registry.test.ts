import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WATCHED_TABLES, coalesce, createRegistry, isWatchedTable } from './registry'

describe('createRegistry', () => {
  it('wakes only the listeners watching the changed table', () => {
    const registry = createRegistry()
    const lessons = vi.fn()
    const charges = vi.fn()

    registry.add(['lessons'], lessons)
    registry.add(['charges'], charges)
    registry.dispatch('lessons')

    expect(lessons).toHaveBeenCalledTimes(1)
    expect(charges).not.toHaveBeenCalled()
  })

  it('wakes a listener watching several tables, from any of them', () => {
    const registry = createRegistry()
    const fire = vi.fn()

    registry.add(['lessons', 'availability', 'availability_overrides'], fire)
    registry.dispatch('availability')
    registry.dispatch('availability_overrides')

    expect(fire).toHaveBeenCalledTimes(2)
  })

  it('wakes every listener watching the same table', () => {
    const registry = createRegistry()
    const a = vi.fn()
    const b = vi.fn()

    registry.add(['lessons'], a)
    registry.add(['lessons'], b)
    registry.dispatch('lessons')

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('ignores a table nobody is watching', () => {
    const registry = createRegistry()
    const fire = vi.fn()

    registry.add(['lessons'], fire)
    registry.dispatch('organizations')

    expect(fire).not.toHaveBeenCalled()
  })

  // Components unmount on navigation; a listener that outlived its component
  // would call router.refresh() on a route that no longer exists.
  it('stops calling a listener after it unsubscribes', () => {
    const registry = createRegistry()
    const fire = vi.fn()

    const unsubscribe = registry.add(['lessons'], fire)
    registry.dispatch('lessons')
    unsubscribe()
    registry.dispatch('lessons')

    expect(fire).toHaveBeenCalledTimes(1)
    expect(registry.size()).toBe(0)
  })

  it('unsubscribes only the listener it belongs to', () => {
    const registry = createRegistry()
    const a = vi.fn()
    const b = vi.fn()

    const unsubscribeA = registry.add(['lessons'], a)
    registry.add(['lessons'], b)
    unsubscribeA()
    registry.dispatch('lessons')

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  // React can unmount a component in response to the very refresh it triggered.
  it('survives a listener that unsubscribes itself while firing', () => {
    const registry = createRegistry()
    const other = vi.fn()

    const unsubscribe = registry.add(['lessons'], () => unsubscribe())
    registry.add(['lessons'], other)

    expect(() => registry.dispatch('lessons')).not.toThrow()
    expect(other).toHaveBeenCalledTimes(1)
  })

  it('keeps notifying the rest when one listener throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const registry = createRegistry()
    const healthy = vi.fn()

    registry.add(['lessons'], () => {
      throw new Error('render blew up')
    })
    registry.add(['lessons'], healthy)
    registry.dispatch('lessons')

    expect(healthy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})

describe('WATCHED_TABLES', () => {
  it('has no duplicates — each becomes one channel binding', () => {
    expect(new Set(WATCHED_TABLES).size).toBe(WATCHED_TABLES.length)
  })

  it('recognises watched and unwatched tables', () => {
    expect(isWatchedTable('lessons')).toBe(true)
    expect(isWatchedTable('organizations')).toBe(false)
  })
})

describe('coalesce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // Approving a month of billing writes one charge row per student. Without
  // coalescing that is one router.refresh() per row.
  it('turns a burst into a single trailing call', () => {
    const fn = vi.fn()
    const burst = coalesce(fn, 300)

    for (let i = 0; i < 50; i++) burst.call()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires again for a change that arrives after the window closed', () => {
    const fn = vi.fn()
    const burst = coalesce(fn, 300)

    burst.call()
    vi.advanceTimersByTime(300)
    burst.call()
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not fire before the window elapses', () => {
    const fn = vi.fn()
    const burst = coalesce(fn, 300)

    burst.call()
    vi.advanceTimersByTime(299)

    expect(fn).not.toHaveBeenCalled()
  })

  // Unmount must not leave a pending refresh pointed at a dead component.
  it('drops a pending call when cancelled', () => {
    const fn = vi.fn()
    const burst = coalesce(fn, 300)

    burst.call()
    burst.cancel()
    vi.advanceTimersByTime(1000)

    expect(fn).not.toHaveBeenCalled()
  })
})
