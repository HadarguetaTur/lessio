import { describe, expect, it } from 'vitest'
import { followupMessage, replySubject, scheduleFollowup, trackFor } from './followups'

const anchor = new Date('2026-09-08T10:00:00Z')
const daysAfter = (d: Date | null) =>
  d === null ? null : Math.round((d.getTime() - anchor.getTime()) / 86_400_000)

describe('scheduleFollowup', () => {
  it('walks the interested track and then stops', () => {
    expect(daysAfter(scheduleFollowup('interested', 0, anchor))).toBe(3)
    expect(daysAfter(scheduleFollowup('interested', 1, anchor))).toBe(4)
    expect(scheduleFollowup('interested', 2, anchor)).toBeNull()
    expect(scheduleFollowup('interested', 9, anchor)).toBeNull()
  })

  it('gives an unreadable reply exactly one clarification', () => {
    expect(daysAfter(scheduleFollowup('replied', 0, anchor))).toBe(2)
    expect(scheduleFollowup('replied', 1, anchor)).toBeNull()
  })
})

describe('trackFor', () => {
  it('only follows up on people who answered', () => {
    expect(trackFor('interested')).toBe('interested')
    expect(trackFor('replied')).toBe('replied')
    for (const s of ['sent', 'queued', 'not_interested', 'unsubscribed', 'bounced', 'converted']) {
      expect(trackFor(s)).toBeNull()
    }
  })

  it('a demo that already went out puts a replied prospect on the interested track', () => {
    expect(trackFor('replied', '2026-09-16T14:44:06Z')).toBe('interested')
    expect(trackFor('interested', '2026-09-16T14:44:06Z')).toBe('interested')
    expect(trackFor('converted', '2026-09-16T14:44:06Z')).toBeNull()
  })
})

describe('replySubject', () => {
  it('adds Re: once', () => {
    expect(replySubject('שאלה על הסטודיו')).toBe('Re: שאלה על הסטודיו')
    expect(replySubject('Re: שאלה על הסטודיו')).toBe('Re: שאלה על הסטודיו')
    expect(replySubject('RE: hello')).toBe('RE: hello')
  })
})

describe('followupMessage', () => {
  const vars = { firstName: 'דנה', signupUrl: 'https://x.test/signup', subject: 'שאלה על הסטודיו', gender: null }

  it('the first touch hands over the video link, the second is a last note with the trial link', () => {
    const first = followupMessage('interested', 0, vars, 'he')
    expect(first.subject).toBe('Re: שאלה על הסטודיו')
    expect(first.text).toContain('היי דנה,')
    expect(first.text).toContain('https://youtu.be/')
    expect(first.text).not.toContain(vars.signupUrl)

    const last = followupMessage('interested', 1, vars, 'he')
    expect(last.text).toContain('הודעה אחרונה')
    expect(last.text).toContain(vars.signupUrl)
  })

  it('the clarification asks for a yes', () => {
    const m = followupMessage('replied', 0, vars, 'he')
    expect(m.text).toContain('הסרטון')
    expect(m.text).toContain('"כן"')
  })

  it('addresses the reader by gender, and avoids the choice when it is unknown', () => {
    const f = followupMessage('interested', 0, { ...vars, gender: 'f' }, 'he')
    const m = followupMessage('interested', 0, { ...vars, gender: 'm' }, 'he')
    const x = followupMessage('interested', 0, { ...vars, gender: null }, 'he')
    expect(f.text).toContain('מדיניות הביטולים שלך')
    expect(m.text).toContain('מדיניות הביטולים שלך')
    // Neutral phrasing must not address the reader at all.
    expect(x.text).toContain('מדיניות הביטולים של העסק')
    expect(x.text).not.toContain('שלך')
  })

  it('works without a first name', () => {
    const m = followupMessage('interested', 0, { ...vars, firstName: null }, 'he')
    expect(m.text.startsWith('היי,')).toBe(true)
  })

  it('has an English voice too', () => {
    const m = followupMessage('interested', 1, { ...vars, firstName: 'Dana' }, 'en')
    expect(m.text).toContain('Hi Dana,')
    expect(m.text).toContain('30 days free')
    expect(m.text).toContain('Hadar')
  })

  it('never uses an em dash', () => {
    for (const locale of ['he', 'en'] as const) {
      for (const [track, stage] of [['interested', 0], ['interested', 1], ['replied', 0]] as const) {
        expect(followupMessage(track, stage, vars, locale).text).not.toContain('—')
      }
    }
  })
})
