import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { getOrgBotStrings, resolveBotString } from './orgStrings'
import { botString } from './strings'
import { CUSTOMIZABLE_BOT_STRINGS, TEMPLATE_BUTTONS } from './templateButtons'

const ORG_ID = 'org-1'

/** A stub whose org_bot_strings query resolves to `rows` (or errors). */
function makeDb(result: { data?: unknown; error?: { message: string } }) {
  const chain: Record<string, unknown> = {}
  const pass = () => chain
  chain.select = pass
  chain.eq = pass
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
  return { from: vi.fn(() => chain) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getOrgBotStrings', () => {
  it('returns the org overrides for whitelisted keys', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeDb({ data: [{ key: 'cta_book_lesson', value: 'לקבוע שיעור אצלנו' }] })
    )

    expect(await getOrgBotStrings(ORG_ID, 'he')).toEqual({
      cta_book_lesson: 'לקבוע שיעור אצלנו',
    })
  })

  it('drops rows for keys that are not open for editing', async () => {
    // A row can outlive its key being un-whitelisted, so the filter runs on
    // read as well as on write.
    mockCreateServiceRoleClient.mockReturnValue(
      makeDb({ data: [{ key: 'btn_confirm_attendance', value: 'בא לי' }] })
    )

    expect(await getOrgBotStrings(ORG_ID, 'he')).toEqual({})
  })

  it('falls back to no overrides when the lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockReturnValue(makeDb({ error: { message: 'boom' } }))

    expect(await getOrgBotStrings(ORG_ID, 'he')).toEqual({})

    warn.mockRestore()
  })

  it('falls back to no overrides when the client throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockImplementation(() => {
      throw new Error('no client')
    })

    expect(await getOrgBotStrings(ORG_ID, 'he')).toEqual({})

    warn.mockRestore()
  })
})

describe('resolveBotString', () => {
  it('prefers the org wording', () => {
    expect(resolveBotString({ cta_book_lesson: 'להזמין שיעור' }, 'cta_book_lesson', 'he')).toBe(
      'להזמין שיעור'
    )
  })

  it('falls back to the built-in string', () => {
    expect(resolveBotString({}, 'cta_book_lesson', 'he')).toBe(botString('cta_book_lesson', 'he'))
    expect(resolveBotString(undefined, 'cta_book_lesson', 'en')).toBe(
      botString('cta_book_lesson', 'en')
    )
  })

  it('ignores an override for a key that is not editable', () => {
    expect(
      resolveBotString({ btn_homework_done: 'משהו אחר' }, 'btn_homework_done', 'he')
    ).toBe(botString('btn_homework_done', 'he'))
  })

  it('still substitutes vars when falling back', () => {
    expect(resolveBotString({}, 'homework_marked_done', 'he', { student_name: 'יעל' })).toContain(
      'יעל'
    )
  })
})

describe('TEMPLATE_BUTTONS', () => {
  it('names only bot strings that exist, in both languages', () => {
    for (const button of Object.values(TEMPLATE_BUTTONS).flat()) {
      // botString falls back to Hebrew for an unknown key, so a missing English
      // string shows up as the Hebrew one rather than as undefined.
      expect(botString(button.labelKey, 'he')).toBeTruthy()
      expect(botString(button.labelKey, 'en')).toBeTruthy()
      expect(botString(button.labelKey, 'en')).not.toBe(botString(button.labelKey, 'he'))
    }
  })

  it('locks every button that belongs to a Meta-approved template', () => {
    for (const button of Object.values(TEMPLATE_BUTTONS).flat()) {
      if (!button.editable) expect(button.lockedReason).toBe('meta_approved')
    }
  })

  it('whitelists exactly the editable labels', () => {
    const editable = new Set(
      Object.values(TEMPLATE_BUTTONS)
        .flat()
        .filter((b) => b.editable)
        .map((b) => b.labelKey)
    )
    expect(new Set(CUSTOMIZABLE_BOT_STRINGS)).toEqual(editable)
  })

  it('keeps every label within Meta’s cap', () => {
    for (const button of Object.values(TEMPLATE_BUTTONS).flat()) {
      for (const locale of ['he', 'en'] as const) {
        expect(botString(button.labelKey, locale).length).toBeLessThanOrEqual(20)
      }
    }
  })

  it('keeps emoji and newlines out of labels on Meta-approved templates', () => {
    // Meta rejects the whole template: "buttons cannot contain variables,
    // newlines, emoji or formatting characters". It surfaces only at
    // registration, long after the label was written, so it is caught here.
    const emoji = /\p{Extended_Pictographic}/u
    for (const button of Object.values(TEMPLATE_BUTTONS).flat()) {
      if (button.editable) continue
      for (const locale of ['he', 'en'] as const) {
        const label = botString(button.labelKey, locale)
        expect(label).not.toMatch(emoji)
        expect(label).not.toContain('\n')
      }
    }
  })
})
