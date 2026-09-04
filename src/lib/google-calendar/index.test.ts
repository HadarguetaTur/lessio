import { describe, it, expect } from 'vitest'
import {
  buildFreeBusyBody,
  parseFreeBusyResponse,
  resolveSelectedCalendars,
  hasCalendarScope,
  DEFAULT_SELECTED_CALENDARS,
  CALENDAR_SCOPE,
} from './index'

describe('buildFreeBusyBody', () => {
  it('includes every calendar id as an item', () => {
    const body = buildFreeBusyBody('2026-09-06T12:00:00Z', '2026-09-06T13:00:00Z', ['primary', 'team@group.calendar.google.com'])
    expect(body).toEqual({
      timeMin: '2026-09-06T12:00:00Z',
      timeMax: '2026-09-06T13:00:00Z',
      items: [{ id: 'primary' }, { id: 'team@group.calendar.google.com' }],
    })
  })

  it('caps at 50 items (the freeBusy API limit)', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `cal-${i}`)
    expect(buildFreeBusyBody('a', 'b', ids).items).toHaveLength(50)
  })
})

describe('parseFreeBusyResponse', () => {
  it('merges busy periods across calendars and tags each with its calendar id', () => {
    const { busy, erroredCalendarIds } = parseFreeBusyResponse(
      {
        calendars: {
          primary: { busy: [{ start: 'A1', end: 'A2' }] },
          'x@y':   { busy: [{ start: 'B1', end: 'B2' }, { start: 'B3', end: 'B4' }] },
        },
      },
      ['primary', 'x@y']
    )
    expect(busy).toEqual([
      { start: 'A1', end: 'A2', calendarId: 'primary' },
      { start: 'B1', end: 'B2', calendarId: 'x@y' },
      { start: 'B3', end: 'B4', calendarId: 'x@y' },
    ])
    expect(erroredCalendarIds).toEqual([])
  })

  it('collects per-calendar errors while still returning the other calendars busy periods', () => {
    const { busy, erroredCalendarIds } = parseFreeBusyResponse(
      {
        calendars: {
          primary: { busy: [{ start: 'A1', end: 'A2' }] },
          broken:  { errors: [{ domain: 'global', reason: 'notFound' }] },
        },
      },
      ['primary', 'broken']
    )
    expect(busy).toEqual([{ start: 'A1', end: 'A2', calendarId: 'primary' }])
    expect(erroredCalendarIds).toEqual(['broken'])
  })

  it('treats a requested calendar missing from the response as errored, not free', () => {
    const { busy, erroredCalendarIds } = parseFreeBusyResponse({ calendars: {} }, ['primary'])
    expect(busy).toEqual([])
    expect(erroredCalendarIds).toEqual(['primary'])
  })

  it('handles a response with no calendars key', () => {
    const { busy, erroredCalendarIds } = parseFreeBusyResponse({}, ['primary'])
    expect(busy).toEqual([])
    expect(erroredCalendarIds).toEqual(['primary'])
  })
})

describe('resolveSelectedCalendars', () => {
  it.each([null, undefined, 'garbage', 42, {}, []])('falls back to the default for %p', (raw) => {
    expect(resolveSelectedCalendars(raw)).toEqual(DEFAULT_SELECTED_CALENDARS)
  })

  it('drops entries without a string id and keeps the rest', () => {
    expect(
      resolveSelectedCalendars([{ no: 'id' }, { id: '' }, { id: 'x@y', summary: 'Work' }, 'junk'])
    ).toEqual([{ id: 'x@y', summary: 'Work' }])
  })

  it('normalizes a non-string summary to null', () => {
    expect(resolveSelectedCalendars([{ id: 'primary', summary: 7 }])).toEqual([
      { id: 'primary', summary: null },
    ])
  })

  it('falls back to the default when every entry is invalid', () => {
    expect(resolveSelectedCalendars([{ bad: true }])).toEqual(DEFAULT_SELECTED_CALENDARS)
  })
})

describe('hasCalendarScope', () => {
  it('accepts a granted scope list containing calendar.readonly', () => {
    expect(hasCalendarScope(`openid email ${CALENDAR_SCOPE}`)).toBe(true)
  })

  it('rejects a grant where the calendar checkbox was left unticked', () => {
    expect(hasCalendarScope('https://www.googleapis.com/auth/userinfo.email openid')).toBe(false)
  })

  it('rejects empty and missing values', () => {
    expect(hasCalendarScope('')).toBe(false)
    expect(hasCalendarScope(null)).toBe(false)
    expect(hasCalendarScope(undefined)).toBe(false)
  })

  it('does not match a scope that merely starts with the calendar scope', () => {
    expect(hasCalendarScope(`${CALENDAR_SCOPE}.events`)).toBe(false)
  })
})
