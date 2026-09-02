import { describe, expect, it } from 'vitest'

import {
  decodeMenuPayload,
  encodeMenuPayload,
  firstName,
  isActionAllowedForRole,
  isGreeting,
  menuActionsFor,
  needsStudent,
} from './menu'
import { botString } from './strings'

describe('menu payload encoding', () => {
  it('round-trips an action', () => {
    expect(decodeMenuPayload(encodeMenuPayload('cancel'))).toEqual({
      action: 'cancel',
      studentId: undefined,
    })
  })

  it('round-trips an action with a student', () => {
    const id = '0142401d-89d0-47ad-bd3f-20edfb4ca444'
    expect(decodeMenuPayload(encodeMenuPayload('book', id))).toEqual({
      action: 'book',
      studentId: id,
    })
  })

  it('ignores payloads that are not ours', () => {
    // Falling through to keyword handling matters: Meta echoes back ids from
    // other interactive messages (and the OTP copy-code button) too.
    expect(decodeMenuPayload(undefined)).toBeNull()
    expect(decodeMenuPayload('')).toBeNull()
    expect(decodeMenuPayload('some-other-button')).toBeNull()
    expect(decodeMenuPayload('m:launch_missiles')).toBeNull()
    expect(decodeMenuPayload('m')).toBeNull()
  })
})

describe('needsStudent', () => {
  it('only booking needs a specific student', () => {
    expect(needsStudent('book')).toBe(true)
    // The cancellation and schedule replies already label every line with the
    // student's name, so a picker there would only remove information.
    expect(needsStudent('cancel')).toBe(false)
    expect(needsStudent('schedule')).toBe(false)
    expect(needsStudent('balance')).toBe(false)
    expect(needsStudent('portal')).toBe(false)
  })
})

describe('role menus', () => {
  const ROLES = ['parent', 'student', 'teacher', 'staff'] as const

  it('gives every role a menu whose rows fit one Meta list', () => {
    for (const role of ROLES) {
      const actions = menuActionsFor(role, true)
      expect(actions.length, role).toBeGreaterThan(0)
      // Meta caps a list section at 10 rows, switcher included.
      expect(actions.length, role).toBeLessThanOrEqual(10)
    }
  })

  it('labels every row it offers, in both languages', () => {
    // A missing string renders as an empty row title, which Meta rejects.
    for (const role of ROLES) {
      for (const action of menuActionsFor(role, true)) {
        for (const locale of ['he', 'en'] as const) {
          const title = botString(`menu_${action}` as const, locale)
          expect(title, `${role}/${action}/${locale}`).not.toContain('{{')
          expect(title.length, `${role}/${action}/${locale} length`).toBeGreaterThan(0)
          // LIST_ROW_TITLE_MAX — longer titles are silently truncated.
          expect(title.length, `${role}/${action}/${locale} too long`).toBeLessThanOrEqual(24)
        }
      }
    }
  })

  it('lets a teacher ask for time off, and only a teacher', () => {
    expect(isActionAllowedForRole('day_off', 'teacher')).toBe(true)
    expect(isActionAllowedForRole('day_off', 'parent')).toBe(false)
    expect(isActionAllowedForRole('day_off', 'student')).toBe(false)
    expect(isActionAllowedForRole('day_off', 'staff')).toBe(false)
  })

  it('keeps the decision on time off with staff alone', () => {
    // A teacher approving their own request would defeat the point of the gate.
    expect(isActionAllowedForRole('pending_requests', 'staff')).toBe(true)
    expect(isActionAllowedForRole('pending_requests', 'teacher')).toBe(false)
    expect(isActionAllowedForRole('pending_requests', 'parent')).toBe(false)
  })

  it('keeps money and the parent portal away from students and teachers', () => {
    for (const role of ['student', 'teacher', 'staff'] as const) {
      expect(isActionAllowedForRole('balance', role), role).toBe(false)
      expect(isActionAllowedForRole('portal', role), role).toBe(false)
    }
  })

  it('offers the dashboard shell to staff and teachers, not to families', () => {
    expect(isActionAllowedForRole('dashboard', 'teacher')).toBe(true)
    expect(isActionAllowedForRole('dashboard', 'staff')).toBe(true)
    expect(isActionAllowedForRole('dashboard', 'parent')).toBe(false)
    expect(isActionAllowedForRole('dashboard', 'student')).toBe(false)
  })

  it('appends the role switcher only when asked', () => {
    expect(menuActionsFor('teacher', true)).toContain('switch_role')
    expect(menuActionsFor('teacher', false)).not.toContain('switch_role')
    // Allowed for anyone holding a second capacity, whatever their menu says.
    expect(isActionAllowedForRole('switch_role', 'student')).toBe(true)
  })

  it('drops rows the org has switched off without touching the rest', () => {
    // An org with the parent portal closed in its settings must not offer it.
    const actions = menuActionsFor('parent', true, ['portal'])
    expect(actions).not.toContain('portal')
    expect(actions).toEqual(['book', 'cancel', 'balance', 'schedule', 'switch_role'])
    // Hiding is per send, not a mutation of the role's menu.
    expect(menuActionsFor('parent')).toContain('portal')
  })
})

describe('isGreeting', () => {
  it('matches bare greetings in both languages', () => {
    for (const t of ['היי', 'הי', 'שלום', 'אהלן', 'hi', 'Hello', 'HEY', 'בוקר טוב', 'שלום!']) {
      expect(isGreeting(t), t).toBe(true)
    }
  })

  it('does not swallow a real question that opens with a greeting', () => {
    for (const t of [
      'היי, מתי השיעור הבא?',
      'hi, can I move my lesson?',
      'שלום רציתי לשאול על החיוב',
      'ביטול',
      'xyz',
      '2',
    ]) {
      expect(isGreeting(t), t).toBe(false)
    }
  })
})

describe('greeting copy', () => {
  const HEBREW = /[֐-׿]/

  it('greets by first name in Hebrew', () => {
    expect(botString('menu_greeting', 'he', { first_name: 'יעל' })).toContain('יעל')
  })

  it('never puts a name — or Hebrew — in the English greeting', () => {
    // Names are stored in Hebrew, so interpolating one would render "Hi יעל 👋".
    const en = botString('menu_greeting', 'en', { first_name: 'יעל' })
    expect(en).not.toContain('יעל')
    expect(HEBREW.test(en)).toBe(false)
    expect(en).not.toContain('{{')
  })

  it('has a no-name variant in both languages that leaves no gap', () => {
    for (const locale of ['he', 'en'] as const) {
      const s = botString('menu_greeting_noname', locale)
      expect(s).not.toContain('{{')
      expect(s).not.toMatch(/ {2,}/)
    }
  })
})

describe('firstName', () => {
  it('takes the first token', () => {
    expect(firstName('יעל לוי')).toBe('יעל')
    expect(firstName('  דנה  כהן ')).toBe('דנה')
  })

  it('returns an empty string when there is no name', () => {
    expect(firstName(null)).toBe('')
    expect(firstName(undefined)).toBe('')
    expect(firstName('   ')).toBe('')
  })
})
