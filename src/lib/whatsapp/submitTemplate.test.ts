import { describe, expect, it } from 'vitest'
import {
  buildCustomComponents,
  buildMetaSubmission,
  customTemplateName,
  extractVarOrder,
  isSubmittableType,
  SUBMITTABLE_TYPES,
} from './submitTemplate'
import { DEFAULT_TEMPLATES, normalizeTemplateBody, TEMPLATE_VARIABLES } from './templates'
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

  it('normalises CRLF line endings — a form-posted textarea body arrives with them', () => {
    const result = buildMetaSubmission(
      'lesson_reminder',
      'en',
      'Reminder: your lesson with {{teacher_name}} is on {{date}} at {{time}}.\r\nSee you there!'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.bodyText).not.toContain('\r')
    expect(result.bodyText).toContain('\nSee you there!')
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
        it(`${type} / ${locale} converts cleanly`, () => {
          const result = buildMetaSubmission(type, locale, DEFAULT_TEMPLATES[locale][type])

          // Every default must be submittable as-is: an org that never edited
          // the copy can still press "submit to Meta". homework_graded used to
          // end with {{feedback_line}} and fail Meta's end-with-variable rule.
          expect(result.ok).toBe(true)
          if (!result.ok) return

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

describe('normalizeTemplateBody', () => {
  it('converts CRLF and lone CR to LF and trims', () => {
    expect(normalizeTemplateBody('  a\r\nb\rc\n ')).toBe('a\nb\nc')
  })

  it('makes a form-posted body equal to its textarea twin', () => {
    // The HTML form-submission algorithm normalises textarea newlines to CRLF;
    // reading the same textarea from JS gives LF. The two must compare equal,
    // or the card thinks it has unsaved edits forever after a save.
    const typed = 'line one\nline two'
    const posted = 'line one\r\nline two'
    expect(normalizeTemplateBody(posted)).toBe(normalizeTemplateBody(typed))
  })
})

describe('the sample values sent to Meta follow the template language', () => {
  it('an English submission carries English examples, not Hebrew ones', () => {
    // TEMPLATE_PREVIEW_VARS used to be a single shared table, so an English org
    // submitted 'אהרון כהן' as the sample a Meta reviewer would read.
    const result = buildMetaSubmission(
      'lesson_reminder',
      'en',
      'Reminder: your lesson with {{teacher_name}} is on {{date}} at {{time}}. See you!'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const value of result.example[0]) {
      expect(value).not.toMatch(/[\u0590-\u05FF]/)
    }
    expect(result.example[0]).toContain('Aaron Cohen')
  })

  it('a Hebrew submission still carries Hebrew examples', () => {
    const result = buildMetaSubmission(
      'lesson_reminder',
      'he',
      'תזכורת: שיעור עם {{teacher_name}} ב{{date}} בשעה {{time}}.'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.example[0]).toContain('אהרון כהן')
  })

  it('every submittable default builds an example for each of its variables', () => {
    for (const type of SUBMITTABLE_TYPES) {
      for (const locale of ['he', 'en'] as AppLocale[]) {
        const result = buildMetaSubmission(type, locale, DEFAULT_TEMPLATES[locale][type])
        expect(result.ok, `${locale}/${type} is not submittable as written`).toBe(true)
        if (!result.ok) continue
        if (result.varOrder.length === 0) continue
        expect(result.example[0].length, `${locale}/${type}`).toBe(result.varOrder.length)
        // An empty example row is rejected by Meta.
        for (const value of result.example[0]) expect(value.length).toBeGreaterThan(0)
      }
    }
  })
})
