import { describe, expect, it } from 'vitest'
import { classifyReply, stripQuotedText } from './classifyReply'

const cls = (bodyText: string, extra: { subject?: string; fromEmail?: string } = {}) =>
  classifyReply({ bodyText, ...extra }).classification

describe('stripQuotedText', () => {
  it('drops a Gmail quote block', () => {
    const body = 'כן, מעניין אותי\n\nOn Mon, 7 Sep 2026 at 10:00 Lessio <hi@getlessio.com> wrote:\n> רוצים דמו?\n> מעוניינים?'
    expect(stripQuotedText(body)).toBe('כן, מעניין אותי')
  })

  it('drops an Outlook original-message block', () => {
    const body = 'No thanks\n\n-----Original Message-----\nFrom: Lessio\nSubject: demo\ninterested?'
    expect(stripQuotedText(body)).toBe('No thanks')
  })

  it('drops a Hebrew Gmail quote header', () => {
    const body = 'לא תודה\n\nבתאריך יום ב׳, 7 בספט׳ 2026 ב-10:00 מאת Lessio <hi@getlessio.com>:\n> דמו'
    expect(stripQuotedText(body)).toBe('לא תודה')
  })

  it('drops ">"-quoted lines wherever they sit', () => {
    expect(stripQuotedText('> old\nnew\n> old again')).toBe('new')
  })
})

describe('classifyReply — hard classes', () => {
  it('bounce by sender', () => {
    expect(cls('whatever', { fromEmail: 'mailer-daemon@googlemail.com' })).toBe('bounce')
  })
  it('bounce by subject', () => {
    expect(cls('', { subject: 'Delivery Status Notification (Failure)' })).toBe('bounce')
  })
  it('bounce by body', () => {
    expect(cls('The email account that you tried to reach does not exist.')).toBe('bounce')
  })
  it('auto reply (en)', () => {
    expect(cls('I am out of the office until Monday and will respond when I return.')).toBe('auto_reply')
    expect(cls('thanks', { subject: 'Automatic reply: hello' })).toBe('auto_reply')
  })
  it('auto reply (he)', () => {
    expect(cls('אני בחופשה, אחזור ב-15 לחודש')).toBe('auto_reply')
  })
  it('unsubscribe (en)', () => {
    expect(cls('Please unsubscribe me')).toBe('unsubscribe')
    expect(cls('no, unsubscribe me')).toBe('unsubscribe')
    expect(cls('STOP')).toBe('unsubscribe')
  })
  it('unsubscribe (he)', () => {
    expect(cls('תסירו אותי מהרשימה')).toBe('unsubscribe')
    expect(cls('אל תשלחו לי יותר')).toBe('unsubscribe')
  })
})

describe('classifyReply — interested / not interested', () => {
  it('positive (he)', () => {
    expect(cls('כן')).toBe('interested')
    expect(cls('כן, מעניין אותי')).toBe('interested')
    expect(cls('אשמח לשמוע פרטים')).toBe('interested')
  })
  it('positive (en)', () => {
    expect(cls('Yes')).toBe('interested')
    expect(cls('Yes! tell me more')).toBe('interested')
    expect(cls('Sounds interesting, send me the details')).toBe('interested')
  })
  it('negative (he)', () => {
    expect(cls('לא')).toBe('not_interested')
    expect(cls('לא תודה')).toBe('not_interested')
    expect(cls('לא מעוניין')).toBe('not_interested')
    expect(cls('לא רלוונטי עבורנו')).toBe('not_interested')
  })
  it('negative (en)', () => {
    expect(cls('No')).toBe('not_interested')
    expect(cls('Not interested, thanks')).toBe('not_interested')
    expect(cls('No thanks')).toBe('not_interested')
  })
  it('"not interested" is not read as "interested"', () => {
    expect(cls('not interested')).toBe('not_interested')
  })
  it('the quoted cold email does not leak into the decision', () => {
    const body = 'לא תודה\n\nOn Mon wrote:\n> רוצים לראות דמו? מעוניינים? ספרו לי'
    expect(cls(body)).toBe('not_interested')
  })
})

describe('classifyReply — ambiguity never suppresses', () => {
  it('"לא רע בכלל, אשמח לראות" is not negative', () => {
    expect(cls('לא רע בכלל, אשמח לראות')).not.toBe('not_interested')
  })
  it('"No problem, send it over" is not negative', () => {
    expect(cls('No problem, send it over')).not.toBe('not_interested')
  })
  it('mixed signals resolve to unknown', () => {
    expect(cls('Not interested right now, but tell me more next quarter')).toBe('unknown')
  })
  it('no signal resolves to unknown', () => {
    expect(cls('Who gave you my address?')).toBe('unknown')
    expect(cls('')).toBe('unknown')
  })
  it('returns the de-quoted snippet', () => {
    const r = classifyReply({ bodyText: 'כן\n> quoted' })
    expect(r.snippet).toBe('כן')
  })
})
