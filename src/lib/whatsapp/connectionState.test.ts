import { describe, it, expect } from 'vitest'
import {
  computeWaState,
  hasUnapprovedOutOfWindowTemplates,
  type WaStateRow,
} from './connectionState'

/**
 * The precedence table from the module docblock, pinned.
 *
 * These cases are the UX audit's state matrix turned into assertions: each row
 * of that table is one state a customer can be in, and the bug being prevented
 * is any of them collapsing back into "connected / not connected".
 */

const NOW = new Date('2026-09-09T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

/** A working, verified, settled connection — the baseline every case deviates from. */
function healthy(overrides: Partial<WaStateRow> = {}): WaStateRow {
  return {
    whatsapp_phone_number_id: '123456789',
    wa_health_error: null,
    wa_account_restricted: false,
    wa_quality_rating: 'GREEN',
    wa_business_verification_status: 'verified',
    wa_connected_at: daysAgo(90),
    wa_health_checked_at: daysAgo(0),
    wa_display_phone_number: '+972 50-123-4567',
    wa_verified_name: 'Studio Michal',
    ...overrides,
  }
}

const onPlan = { planHasWhatsApp: true, now: NOW }

describe('computeWaState() — precedence', () => {
  it('is active only when everything is fine', () => {
    const result = computeWaState(healthy(), onPlan)
    expect(result.state).toBe('active')
    expect(result.reasons).toEqual([])
    expect(result.needsAction).toBe(false)
  })

  it('reports plan_locked before anything else, connected or not', () => {
    const off = { planHasWhatsApp: false, now: NOW }
    expect(computeWaState(healthy(), off).state).toBe('plan_locked')
    expect(computeWaState(null, off).state).toBe('plan_locked')
    // Even a dead connection: an org that was never sold WhatsApp should not be
    // told to go and fix one.
    expect(
      computeWaState(healthy({ wa_health_error: 'token_invalid' }), off).state
    ).toBe('plan_locked')
  })

  it('reports not_connected for a missing row or a missing number', () => {
    expect(computeWaState(null, onPlan).state).toBe('not_connected')
    expect(
      computeWaState(healthy({ whatsapp_phone_number_id: null }), onPlan).state
    ).toBe('not_connected')
  })

  it('puts a dead token above every other problem', () => {
    const result = computeWaState(
      healthy({
        wa_health_error: 'token_invalid',
        wa_account_restricted: true,
        wa_quality_rating: 'RED',
      }),
      onPlan
    )
    expect(result.state).toBe('reconnect_required')
    expect(result.reasons).toEqual(['token_invalid'])
    expect(result.needsAction).toBe(true)
  })

  it('puts a Meta restriction above a quality problem', () => {
    const result = computeWaState(
      healthy({ wa_account_restricted: true, wa_quality_rating: 'RED' }),
      onPlan
    )
    expect(result.state).toBe('blocked_by_meta')
    expect(result.reasons).toEqual(['restricted'])
  })

  it('reports at_risk for RED quality', () => {
    const result = computeWaState(healthy({ wa_quality_rating: 'RED' }), onPlan)
    expect(result.state).toBe('at_risk')
    expect(result.needsAction).toBe(true)
  })
})

describe('computeWaState() — limited', () => {
  it('is limited while the number is in warm-up, with nothing to do', () => {
    const result = computeWaState(healthy({ wa_connected_at: daysAgo(3) }), onPlan)
    expect(result.state).toBe('limited')
    expect(result.reasons).toContain('warm_up')
    expect(result.needsAction).toBe(false)
  })

  it('is limited and waiting while Meta reviews the business', () => {
    const result = computeWaState(
      healthy({ wa_business_verification_status: 'pending' }),
      onPlan
    )
    expect(result.state).toBe('limited')
    expect(result.reasons).toEqual(['verification_pending'])
    expect(result.needsAction).toBe(false)
  })

  it('is limited and actionable when the business was never verified', () => {
    for (const status of [null, 'not_verified', 'rejected', 'failed']) {
      const result = computeWaState(
        healthy({ wa_business_verification_status: status }),
        onPlan
      )
      expect(result.state).toBe('limited')
      expect(result.reasons).toContain('unverified_business')
      expect(result.needsAction).toBe(true)
    }
  })

  it('is limited and actionable on YELLOW quality', () => {
    const result = computeWaState(healthy({ wa_quality_rating: 'YELLOW' }), onPlan)
    expect(result.state).toBe('limited')
    expect(result.reasons).toContain('quality_yellow')
    expect(result.needsAction).toBe(true)
  })

  it('is limited and waiting when templates are not approved', () => {
    const result = computeWaState(healthy(), { ...onPlan, templatesUnapproved: true })
    expect(result.state).toBe('limited')
    expect(result.reasons).toEqual(['templates_unapproved'])
    expect(result.needsAction).toBe(false)
  })

  it('leaves the state active when the template check was not run', () => {
    // undefined means "not checked", which must never invent a reason — the
    // dashboard banner skips that query on purpose.
    expect(computeWaState(healthy(), onPlan).state).toBe('active')
  })

  it('treats an unreachable Meta as a caveat, never as a broken connection', () => {
    const result = computeWaState(healthy({ wa_health_error: 'unreachable' }), onPlan)
    expect(result.state).toBe('limited')
    expect(result.reasons).toEqual(['unreachable'])
    expect(result.needsAction).toBe(false)
  })

  it('collects every reason that applies at once', () => {
    const result = computeWaState(
      healthy({
        wa_quality_rating: 'YELLOW',
        wa_connected_at: daysAgo(2),
        wa_business_verification_status: 'pending',
      }),
      { ...onPlan, templatesUnapproved: true }
    )
    expect(result.state).toBe('limited')
    expect(result.reasons).toEqual([
      'quality_yellow',
      'warm_up',
      'verification_pending',
      'templates_unapproved',
    ])
  })
})

describe('computeWaState() — carried fields', () => {
  it('carries the cached identity and last check through every state', () => {
    const result = computeWaState(healthy({ wa_health_error: 'token_invalid' }), onPlan)
    expect(result.displayPhoneNumber).toBe('+972 50-123-4567')
    expect(result.verifiedName).toBe('Studio Michal')
    expect(result.lastCheckedAt).toBe(daysAgo(0))
    // A broken connection still has a number — that is exactly the distinction
    // the old single boolean could not express.
    expect(result.hasNumber).toBe(true)
  })

  it('reports hasNumber false when nothing is stored', () => {
    expect(computeWaState(null, onPlan).hasNumber).toBe(false)
  })
})

describe('hasUnapprovedOutOfWindowTemplates()', () => {
  type StatusRow = { templateName: string; language: string; status: string; type: string | null }

  const approvedBuiltIns = (locale: 'he' | 'en'): StatusRow[] => [
    { templateName: `lessio_lesson_reminder_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_payment_reminder_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_payment_request_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_homework_reminder_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_homework_assignment_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_homework_graded_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_day_off_decision_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_exam_good_luck_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_lesson_cancelled_by_teacher_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
    { templateName: `lessio_payment_received_${locale}_v2`, language: locale, status: 'APPROVED', type: null },
  ]

  it('is true when nothing has been approved', () => {
    expect(hasUnapprovedOutOfWindowTemplates([], 'he')).toBe(true)
  })

  it('is true when a single type is still pending', () => {
    const rows = approvedBuiltIns('he').map((r) =>
      r.templateName.includes('lesson_reminder') ? { ...r, status: 'PENDING' } : r
    )
    expect(hasUnapprovedOutOfWindowTemplates(rows, 'he')).toBe(true)
  })

  it("accepts an org's own approved submission in place of the built-in", () => {
    const rows = approvedBuiltIns('he').map((r) =>
      r.templateName.includes('lesson_reminder') ? { ...r, status: 'REJECTED' } : r
    )
    rows.push({
      templateName: 'lessio_lesson_reminder_he_c1',
      language: 'he',
      status: 'APPROVED',
      type: 'lesson_reminder',
    })
    expect(hasUnapprovedOutOfWindowTemplates(rows, 'he')).toBe(false)
  })

  it('only counts the language being asked about', () => {
    // A fully approved Hebrew set says nothing about an English-speaking org.
    expect(hasUnapprovedOutOfWindowTemplates(approvedBuiltIns('he'), 'en')).toBe(true)
  })
})
