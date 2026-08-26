/**
 * Fingerprint stability tests — Sprint 32 M3.
 *
 * These pin the two failure modes that would break recurring-bug detection
 * silently: grouping too tightly (one bug opens many issues, the threshold
 * never trips) and grouping too loosely (unrelated bugs merge into one issue
 * nobody can act on).
 */

import { describe, it, expect } from 'vitest'
import { fingerprintError, normalizeMessage, normalizeRoute } from './fingerprint'

describe('normalizeMessage()', () => {
  it('collapses uuids', () => {
    expect(normalizeMessage('Student 3f2a8c5e-1111-4222-8333-444455556666 not found')).toBe(
      'Student <uuid> not found'
    )
  })

  it('collapses numbers, dates, phones, emails and urls', () => {
    expect(normalizeMessage('Charge 4821 failed')).toBe('Charge <num> failed')
    expect(normalizeMessage('Lesson at 2026-08-26T09:00:00Z was gone')).toBe(
      'Lesson at <date> was gone'
    )
    expect(normalizeMessage('No parent for +972501234567')).toBe('No parent for <phone>')
    expect(normalizeMessage('Bad address dana@example.com here')).toBe('Bad address <email> here')
    expect(normalizeMessage('POST https://api.meta.com/v19/x failed')).toBe('POST <url> failed')
  })

  it('collapses quoted values but keeps the sentence shape', () => {
    expect(normalizeMessage(`column "org_id" does not exist`)).toBe('column "<v>" does not exist')
  })

  it('collapses whitespace so a wrapped line and a flat one agree', () => {
    expect(normalizeMessage('failed   to\n  load')).toBe('failed to load')
  })

  it('caps very long messages', () => {
    expect(normalizeMessage('x'.repeat(2000)).length).toBeLessThanOrEqual(500)
  })
})

describe('normalizeRoute()', () => {
  it('collapses uuid and numeric path segments', () => {
    expect(normalizeRoute('/students/3f2a8c5e-1111-4222-8333-444455556666/edit')).toBe(
      '/students/<id>/edit'
    )
    expect(normalizeRoute('/lessons/482')).toBe('/lessons/<id>')
  })

  it('drops the query string', () => {
    expect(normalizeRoute('/billing?month=2026-08')).toBe('/billing')
  })
})

describe('fingerprintError()', () => {
  it('gives the same bug from different users one fingerprint', () => {
    const a = fingerprintError({
      name: 'TypeError',
      message: 'Student 3f2a8c5e-1111-4222-8333-444455556666 not found',
      route: '/students/3f2a8c5e-1111-4222-8333-444455556666',
    })
    const b = fingerprintError({
      name: 'TypeError',
      message: 'Student 91bd0000-2222-4333-8444-555566667777 not found',
      route: '/students/91bd0000-2222-4333-8444-555566667777',
    })

    expect(a).toBe(b)
  })

  it('does NOT fold the digest in — it changes every deploy', () => {
    const base = { name: 'Error', message: 'boom', route: '/billing' }

    expect(fingerprintError({ ...base, digest: 'build-1-abc' })).toBe(
      fingerprintError({ ...base, digest: 'build-2-xyz' })
    )
  })

  it('separates genuinely different errors', () => {
    const notFound = fingerprintError({ name: 'Error', message: 'not found', route: '/billing' })
    const denied = fingerprintError({ name: 'Error', message: 'permission denied', route: '/billing' })
    const otherRoute = fingerprintError({ name: 'Error', message: 'not found', route: '/students' })
    const otherName = fingerprintError({ name: 'TypeError', message: 'not found', route: '/billing' })

    expect(new Set([notFound, denied, otherRoute, otherName]).size).toBe(4)
  })

  it('is stable across calls and shaped as 16 hex chars', () => {
    const input = { name: 'Error', message: 'boom', route: '/x' }
    expect(fingerprintError(input)).toBe(fingerprintError(input))
    expect(fingerprintError(input)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('tolerates missing fields', () => {
    expect(fingerprintError({})).toMatch(/^[0-9a-f]{16}$/)
    expect(fingerprintError({ message: null, name: null, route: null })).toMatch(/^[0-9a-f]{16}$/)
  })

  it('treats a missing name as Error, so both spellings group together', () => {
    expect(fingerprintError({ message: 'boom', route: '/x' })).toBe(
      fingerprintError({ name: 'Error', message: 'boom', route: '/x' })
    )
  })
})
