import { describe, expect, it } from 'vitest'
import { NOT_SUBMITTED, builtInTemplateName, resolveTemplateApproval } from './templateApprovalView'
import { buildMetaSubmission } from './submitTemplate'
import type { TemplateStatusRow } from './templateStatus'

const TYPE = 'lesson_reminder' as const
const BUILT_IN = builtInTemplateName(TYPE, 'he')!

const V1_BODY = 'שלום, תזכורת לשיעור עם {{teacher_name}} ב-{{date}} בשעה {{time}}. נתראה!'
const V2_BODY = 'היי! שיעור עם {{teacher_name}} מחר, {{date}} בשעה {{time}}.'

function positional(body: string): string {
  const built = buildMetaSubmission(TYPE, 'he', body)
  if (!built.ok) throw new Error(`fixture body invalid: ${built.code}`)
  return built.bodyText
}

function submission(
  version: number,
  body: string,
  status: string,
  reason: string | null = null
): TemplateStatusRow {
  return {
    templateName: `lessio_lesson_reminder_he_c${version}`,
    language: 'he',
    status,
    reason,
    type: TYPE,
    version,
    bodyText: positional(body),
    varOrder: ['teacher_name', 'date', 'time'],
    updatedAt: '2026-08-20T00:00:00Z',
  }
}

function builtInRow(status = 'APPROVED'): TemplateStatusRow {
  return {
    templateName: BUILT_IN,
    language: 'he',
    status,
    reason: null,
    type: null,
    version: null,
    bodyText: null,
    varOrder: null,
    updatedAt: '2026-08-20T00:00:00Z',
  }
}

describe('resolveTemplateApproval', () => {
  it('shows the built-in status when the org never edited or submitted', () => {
    const view = resolveTemplateApproval([builtInRow()], TYPE, 'he', 'default text', false)
    expect(view).toMatchObject({ status: 'APPROVED', metaName: BUILT_IN, source: 'builtin', sendsMeanwhile: null })
  })

  it('defaults the built-in to PENDING when Meta has not reported on it yet', () => {
    const view = resolveTemplateApproval([], TYPE, 'he', 'default text', false)
    expect(view).toMatchObject({ status: 'PENDING', source: 'builtin' })
  })

  it('reports UNKNOWN, not PENDING, when the status lookup failed', () => {
    // An expired token produces no rows and no verdict. PENDING would tell the
    // owner Meta is reviewing her copy while the connection is actually dead.
    const view = resolveTemplateApproval([], TYPE, 'he', 'default text', false, false)
    expect(view).toMatchObject({ status: 'UNKNOWN', source: 'builtin' })
  })

  it('keeps a real Meta verdict even when the lookup later failed', () => {
    const view = resolveTemplateApproval([builtInRow()], TYPE, 'he', 'default text', false, false)
    expect(view).toMatchObject({ status: 'APPROVED', source: 'builtin' })
  })

  it('marks a saved custom body NOT_SUBMITTED even when the built-in is approved', () => {
    const view = resolveTemplateApproval([builtInRow()], TYPE, 'he', V1_BODY, true)
    expect(view).toMatchObject({
      status: NOT_SUBMITTED,
      metaName: null,
      source: 'custom',
      sendsMeanwhile: { metaName: BUILT_IN, source: 'builtin' },
      validationError: null,
    })
  })

  it('reports APPROVED when the saved body matches the approved submission', () => {
    const rows = [builtInRow(), submission(1, V1_BODY, 'APPROVED')]
    const view = resolveTemplateApproval(rows, TYPE, 'he', V1_BODY, true)
    expect(view).toMatchObject({ status: 'APPROVED', metaName: 'lessio_lesson_reminder_he_c1', sendsMeanwhile: null })
  })

  it('drops to NOT_SUBMITTED after an edit, and names the approved copy still being sent', () => {
    const rows = [builtInRow(), submission(1, V1_BODY, 'APPROVED')]
    const view = resolveTemplateApproval(rows, TYPE, 'he', V2_BODY, true)
    expect(view).toMatchObject({
      status: NOT_SUBMITTED,
      sendsMeanwhile: { metaName: 'lessio_lesson_reminder_he_c1', source: 'custom' },
    })
  })

  it('reports PENDING for a body that matches the pending submission', () => {
    const rows = [submission(1, V1_BODY, 'APPROVED'), submission(2, V2_BODY, 'PENDING')]
    const view = resolveTemplateApproval(rows, TYPE, 'he', V2_BODY, true)
    expect(view).toMatchObject({
      status: 'PENDING',
      metaName: 'lessio_lesson_reminder_he_c2',
      sendsMeanwhile: { metaName: 'lessio_lesson_reminder_he_c1', source: 'custom' },
    })
  })

  it('recognises a revert to v1 wording as APPROVED while v2 is still pending', () => {
    const rows = [submission(2, V2_BODY, 'PENDING'), submission(1, V1_BODY, 'APPROVED')]
    const view = resolveTemplateApproval(rows, TYPE, 'he', V1_BODY, true)
    expect(view).toMatchObject({ status: 'APPROVED', metaName: 'lessio_lesson_reminder_he_c1', sendsMeanwhile: null })
  })

  it('surfaces REJECTED with its reason when the saved body is the rejected one', () => {
    const rows = [submission(1, V1_BODY, 'REJECTED', 'INVALID_FORMAT')]
    const view = resolveTemplateApproval(rows, TYPE, 'he', V1_BODY, true)
    expect(view).toMatchObject({
      status: 'REJECTED',
      reason: 'INVALID_FORMAT',
      sendsMeanwhile: { metaName: BUILT_IN, source: 'builtin' },
    })
  })

  it('treats a CRLF copy of the submitted body as the same wording', () => {
    const rows = [submission(1, V1_BODY, 'APPROVED')]
    const view = resolveTemplateApproval(rows, TYPE, 'he', V1_BODY.replace(' ', '\r\n'), true)
    // Line breaks are normalised, but a space → newline is still a different body.
    expect(view?.status).toBe(NOT_SUBMITTED)
    const same = resolveTemplateApproval(rows, TYPE, 'he', `${V1_BODY}\r\n`, true)
    expect(same?.status).toBe('APPROVED')
  })

  it('returns NOT_SUBMITTED with a validation error for a body Meta would refuse', () => {
    const view = resolveTemplateApproval([], TYPE, 'he', '{{teacher_name}} starts with a variable', true)
    expect(view).toMatchObject({
      status: NOT_SUBMITTED,
      validationError: { code: 'startsWithVariable' },
    })
  })

  it('ignores submissions for another language', () => {
    const en = { ...submission(1, V1_BODY, 'APPROVED'), language: 'en', templateName: 'lessio_lesson_reminder_en_c1' }
    const view = resolveTemplateApproval([en], TYPE, 'he', V1_BODY, true)
    expect(view?.status).toBe(NOT_SUBMITTED)
  })
})
