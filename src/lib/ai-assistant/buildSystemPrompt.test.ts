/**
 * Tests for buildSystemPrompt.
 * Per /docs/sprint-19-scope.md § Test Plan — automated.
 *
 * Strategy: mock the entire Supabase service-role client with a universal
 * chain proxy (every method returns itself or a resolved value), then verify
 * the returned prompt string contains the expected org name and structural
 * sections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Universal chain mock ──────────────────────────────────────────────────────

function makeChain(resolve: () => unknown): Record<string, unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'gt', 'order', 'limit']
  for (const m of methods) {
    chain[m] = () => chain
  }
  chain['single'] = resolve
  chain['maybeSingle'] = resolve
  return chain
}

const orgData = { name: 'מכון כוכב', timezone: 'Asia/Jerusalem' }

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'organizations') {
        return makeChain(() => Promise.resolve({ data: orgData, error: null }))
      }
      if (table === 'parents') {
        return makeChain(() => Promise.resolve({ data: null, error: null }))
      }
      // All other tables — return empty arrays
      return makeChain(() => Promise.resolve({ data: [], error: null }))
    },
  })),
}))

vi.mock('luxon', async (importOriginal) => {
  const orig = await importOriginal<typeof import('luxon')>()
  const fakeNow = orig.DateTime.fromISO('2026-04-18T10:00:00', { zone: 'Asia/Jerusalem' })
  return {
    ...orig,
    DateTime: {
      ...orig.DateTime,
      now: vi.fn(() => fakeNow),
      fromISO: orig.DateTime.fromISO.bind(orig.DateTime),
    },
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes the org name in the greeting and rules sections', async () => {
    const { buildSystemPrompt } = await import('./buildSystemPrompt')
    const prompt = await buildSystemPrompt('org-1', '+972501234567')

    expect(prompt).toContain('מכון כוכב')
    expect(prompt).toMatch(/אתה עוזר AI של מכון כוכב/)
    expect(prompt).toContain('כללים')
    expect(prompt).toContain('אל תיצור')
  })

  it('falls back to "הלקוח" when parent is not found', async () => {
    const { buildSystemPrompt } = await import('./buildSystemPrompt')
    const prompt = await buildSystemPrompt('org-1', '+972509876543')

    expect(prompt).toContain('הלקוח')
  })

  it('contains required structural sections', async () => {
    const { buildSystemPrompt } = await import('./buildSystemPrompt')
    const prompt = await buildSystemPrompt('org-1', '+972501234567')

    expect(prompt).toContain('מידע על הלקוח')
    expect(prompt).toContain('שיעורים קרובים')
    expect(prompt).toContain('יתרה לתשלום')
    expect(prompt).toContain('כללים')
  })
})
