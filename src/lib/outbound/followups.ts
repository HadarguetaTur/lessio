/**
 * Follow-ups, only for people who already answered.
 *
 * A prospect who never replied is not followed up: a second cold email to
 * someone who ignored the first is what gets a domain marked as spam, and it
 * is not how the founder wants to sell. Two tracks, both short:
 *
 *   interested — they said yes, the demo went out. +3 days "did you watch?",
 *                +7 days a last note. Then silence.
 *   replied    — they wrote something the classifier could not read as yes or
 *                no. One clarification at +2 days, then it waits for a human.
 *
 * Any real inbound reply cancels what is queued (see ingestReply): the point
 * of a follow-up is to get an answer, and an answer arrived.
 *
 * Follow-ups go from the mailbox that sent the cold email, inside the same
 * Gmail conversation, so the person sees one thread rather than a stranger.
 */

import { DateTime } from 'luxon'

import type { OutboundLocale, ProspectGender } from './types'

export type FollowupTrack = 'interested' | 'replied'

/** Days after the previous touch, per stage. Beyond the list: nothing. */
export const FOLLOWUP_PLAN: Record<FollowupTrack, number[]> = {
  interested: [3, 4], // +3d after the demo, then +4d more (a week in total)
  replied: [2],
}

/** When the next touch is due, or null when the track is finished. */
export function scheduleFollowup(track: FollowupTrack, stage: number, anchor: Date): Date | null {
  const days = FOLLOWUP_PLAN[track][stage]
  if (days === undefined) return null
  return DateTime.fromJSDate(anchor).plus({ days }).toJSDate()
}

export function trackFor(status: string): FollowupTrack | null {
  if (status === 'interested') return 'interested'
  if (status === 'replied') return 'replied'
  return null
}

/** `Re:` once, however many rounds the thread has had. */
export function replySubject(subject: string): string {
  return /^\s*re:/i.test(subject) ? subject : `Re: ${subject}`
}

export interface FollowupVars {
  firstName: string | null
  signupUrl: string
  subject: string
  gender: ProspectGender | null
}

/**
 * Hebrew has to choose a gender to address someone, and guessing wrong reads
 * worse than not choosing. Each line is written out per gender rather than
 * assembled from parts: `null` gets phrasing that needs no choice at all.
 */
const HE_LINES: Record<'f' | 'm' | 'x', { watched: string; clarify: string }> = {
  f: {
    watched: 'הספקת לראות את הדמו ששלחתי? אם משהו לא היה ברור, או אם כדאי שאראה לך איך זה עובד על התלמידים שלך, אני כאן.',
    clarify: 'ראיתי את התשובה שלך ורציתי לוודא שהבנתי נכון. שאשלח לך דמו קצר של Lessio, 75 שניות? מספיק לענות "כן".',
  },
  m: {
    watched: 'הספקת לראות את הדמו ששלחתי? אם משהו לא היה ברור, או אם כדאי שאראה לך איך זה עובד על התלמידים שלך, אני כאן.',
    clarify: 'ראיתי את התשובה שלך ורציתי לוודא שהבנתי נכון. שאשלח לך דמו קצר של Lessio, 75 שניות? מספיק לענות "כן".',
  },
  x: {
    watched: 'יצא לראות את הדמו ששלחתי? אם משהו לא היה ברור, או אם כדאי לראות איך זה עובד על התלמידים בפועל, אני כאן.',
    clarify: 'ראיתי את התשובה ורציתי לוודא שהבנתי נכון. לשלוח דמו קצר של Lessio, 75 שניות? מספיק לענות "כן".',
  },
}

export function followupMessage(
  track: FollowupTrack,
  stage: number,
  vars: FollowupVars,
  locale: OutboundLocale
): { subject: string; text: string } {
  const subject = replySubject(vars.subject)
  const name = vars.firstName?.trim()

  if (locale === 'en') {
    const hi = name ? `Hi ${name},` : 'Hi,'
    if (track === 'replied') {
      return {
        subject,
        text: `${hi}\n\nI saw your reply and wanted to make sure I read it right. Should I send the short Lessio demo (75 seconds)? Answering "yes" is enough.\n\nHadar`,
      }
    }
    if (stage === 0) {
      return {
        subject,
        text: `${hi}\n\nDid you get a chance to watch the demo I sent? If something was unclear, or it would help to see it on your own students, I am here.\n\nHadar`,
      }
    }
    return {
      subject,
      text: `${hi}\n\nThis is my last note on it, promise. If now is not the time, that is completely fine. And if it is, you can start 30 days free without a card: ${vars.signupUrl}\n\nHadar`,
    }
  }

  const lines = HE_LINES[vars.gender ?? 'x']
  const hi = name ? `היי ${name},` : 'היי,'
  if (track === 'replied') {
    return { subject, text: `${hi}\n\n${lines.clarify}\n\nהדר` }
  }
  if (stage === 0) {
    return { subject, text: `${hi}\n\n${lines.watched}\n\nהדר` }
  }
  return {
    subject,
    text: `${hi}\n\nזו ההודעה האחרונה שלי בנושא, מבטיחה. אם זה לא הזמן, לגמרי בסדר. ואם כן, אפשר פשוט להתחיל 30 יום ניסיון בלי כרטיס אשראי: ${vars.signupUrl}\n\nהדר`,
  }
}
