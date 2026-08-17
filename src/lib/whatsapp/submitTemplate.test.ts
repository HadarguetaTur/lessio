import { describe, expect, it } from 'vitest'
import {
  buildCustomComponents,
  buildMetaSubmission,
  customTemplateName,
  extractVarOrder,
  isSubmittableType,
  SUBMITTABLE_TYPES,
} from './submitTemplate'
import { DEFAULT_TEMPLATES, TEMPLATE_VARIABLES } from './templates'
import type { AppLocale } from '@/lib/i18n/locale'

describe('extractVarOrder', () => {
  it('returns variables in order of first appearance', () => {
    expect(extractVarOrder('hi {{b}} then {{a}} then {{c}}')).toEqual(['b', 'a', 'c'])
  })

  it('lists a repeated variable once', () => {
    expect(extractVarOrder('{{a}} and again {{a}} plus {{b}}')).toEqual(['a', 'b'])
  })

  it('returns nothing for a body with no variables', () => {
    expect(extractVarOrder('just plain text')).toEqual([])
  })
})

describe('isSubmittableType', () => {
  it('accepts the out-of-window types', () => {
    expect(isSubmittableType('lesson_reminder')).toBe(true)
    expect(isSubmittableType('payment_request')).toBe(true)
  })

  it('rejects in-window reply types and unknown strings', () => {
    expect(isSubmittableType('balance_reply')).toBe(false)
    expect(isSubmittableType('schedule_reply')).toBe(false)
    expect(isSubmittableType('not_a_type')).toBe(false)
  })

  it('rejects lesson_cancelled_by_teacher — its Meta template carries a button', () => {
    expect(isSubmittableType('lesson_cancelled_by_teacher')).toBe(false)
  })
})

describe('buildMetaSubmission', () => {
  it('rewrites named variables to positional ones', () => {
    const result = buildMetaSubmission(
      'lesson_reminder',
      'en',
      'Reminder: your lesson with {{teacher_name}} is on {{date}} at {{time}}. See you!'
    )

    expect(result).toMatchObject({
      ok: true,
      bodyText: 'Reminder: your lesson with {{1}} is on {{2}} at {{3}}. See you!',
      varOrder: ['teacher_name', 'date', 'time'],
    })
  })

  it('numbers by first appearance, not by the type\'s declared variable order', () => {
    const result = buildMetaSubmission(
      'lesson_reminder',
      'en',
      'On {{date}} at {{time}} you meet {{teacher_name}} — see you.'
    )

    expect(result).toMatchObject({
      ok: true,
      bodyText: 'On {{1}} at {{2}} you meet {{3}} — see you.',
      varOrder: ['date', 'time', 'teacher_name'],
    })
  })

  it('gives a repeated variable one index and rewrites every occurrence', () => {
    const result = buildMetaSubmission(
      'lesson_reminder',
      'en',
      'Lesson with {{teacher_name}} at {{time}}. Ask {{teacher_name}} if you are late.'
    )

    expect(result).toMatchObject({
      ok: true,
      bodyText: 'Lesson with {{1}} at {{2}}. Ask {{1}} if you are late.',
      varOrder: ['teacher_name', 'time'],
    })
  })

  it('builds one example row, one value per parameter', () => {
    const result = buildMetaSubmission(
      'homework_graded',
      'en',
      'Homework "{{title}}" scored {{score}} out of 100. {{feedback_line}} Well done.'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.example).toHaveLength(1)
    expect(result.example[0]).toHaveLength(result.varOrder.length)
  })

  it('sends no example for a body with no variables', () => {
    const result = buildMetaSubmission('lesson_reminder', 'en', 'Your lesson is coming up soon.')

    expect(result).toMatchObject({ ok: true, varOrder: [], example: [] })
  })

  it('normalises example values Meta would reject — newlines collapse to spaces', () => {
    // homework_assignment's due_line preview value starts with "\n".
    const result = buildMetaSubmission(
      'homework_assignment',
      'he',
      'שיעורי בית: {{title}}\n{{body}}\n{{due_line}}\nבהצלחה!'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const value of result.example[0]) {
      expect(value).not.toMatch(/[\n\t]/)
      expect(value.length).toBeGreaterThan(0)
    }
  })

  describe('rejections', () => {
    it('rejects a type that is not submittable', () => {
      expect(buildMetaSubmission('balance_reply', 'he', 'text {{total}} more')).toEqual({
        ok: false,
        code: 'notSubmittable',
      })
    })

    it('rejects an empty body', () => {
      expect(buildMetaSubmission('lesson_reminder', 'he', '   \n  ')).toEqual({
        ok: false,
        code: 'emptyBody',
      })
    })

    it('rejects a variable the type does not offer', () => {
      expect(
        buildMetaSubmission('lesson_reminder', 'en', 'Hello {{parent_name}}, see you soon.')
      ).toEqual({ ok: false, code: 'unknownVariable', variable: 'parent_name' })
    })

    // Meta error 2388299 — see the note on lessio_payment_request_he_v2.
    it('rejects a body that starts with a variable', () => {
      expect(
        buildMetaSubmission('lesson_reminder', 'en', '{{teacher_name}} is expecting you today.')
      ).toEqual({ ok: false, code: 'startsWithVariable' })
    })

    it('rejects a body that ends with a variable', () => {
      expect(
        buildMetaSubmission('lesson_reminder', 'en', 'Your lesson today is at {{time}}')
      ).toEqual({ ok: false, code: 'endsWithVariable' })
    })

    it('rejects a body over Meta\'s 1024-character limit', () => {
      const long = `Reminder about your lesson. ${'x'.repeat(1100)}`
      expect(buildMetaSubmission('lesson_reminder', 'en', long)).toEqual({
        ok: false,
        code: 'tooLong',
      })
    })
  })

  describe('every submittable default template', () => {
    const locales: AppLocale[] = ['he', 'en']

    for (const type of SUBMITTABLE_TYPES) {
      for (const locale of locales) {
        it(`${type} / ${locale} converts without an unknown variable`, () => {
          const result = buildMetaSubmission(type, locale, DEFAULT_TEMPLATES[locale][type])

          // A default body may still trip Meta's start/end rule — that is a real
          // constraint the owner has to edit around — but it must never use a
          // variable the settings UI does not advertise for its own type.
          if (!result.ok) {
            expect(result.code).not.toBe('unknownVariable')
            return
          }

          expect(result.varOrder.every((v) => TEMPLATE_VARIABLES[type].includes(v))).toBe(true)
          expect(result.bodyText).not.toMatch(/\{\{[a-z_]+\}\}/)
        })
      }
    }
  })
})

describe('buildCustomComponents', () => {
  it('emits parameters in the recorded order', () => {
    expect(
      buildCustomComponents(['date', 'teacher_name'], { teacher_name: 'Sara', date: '12/5' }, 'en')
    ).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '12/5' },
          { type: 'text', text: 'Sara' },
        ],
      },
    ])
  })

  it('emits no components when the template has no parameters', () => {
    expect(buildCustomComponents([], { teacher_name: 'Sara' }, 'en')).toEqual([])
  })

  it('collapses newlines and tabs, which Meta rejects in a parameter', () => {
    const [component] = buildCustomComponents(['due_line'], { due_line: '\nDue:\tFriday' }, 'en')
    expect(component).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'Due: Friday' }],
    })
  })

  it('replaces a missing value with a localised placeholder, never an empty string', () => {
    const [he] = buildCustomComponents(['teacher_name'], {}, 'he')
    const [en] = buildCustomComponents(['teacher_name'], {}, 'en')

    expect(he).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'המורה' }] })
    expect(en).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'your teacher' }] })
  })

  it('falls back to a neutral placeholder for a variable with no wording of its own', () => {
    const [component] = buildCustomComponents(['booking_url'], {}, 'en')
    expect(component).toEqual({ type: 'body', parameters: [{ type: 'text', text: '-' }] })
  })
})

describe('customTemplateName', () => {
  it('uses the _c<n> suffix so it can never collide with Lessio\'s own _v2 names', () => {
    expect(customTemplateName('lesson_reminder', 'he', 1)).toBe('lessio_lesson_reminder_he_c1')
    expect(customTemplateName('payment_request', 'en', 12)).toBe('lessio_payment_request_en_c12')
  })
})
