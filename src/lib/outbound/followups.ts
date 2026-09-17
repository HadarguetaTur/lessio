/**
 * Follow-ups, only for people who already answered.
 *
 * A prospect who never replied is not followed up: a second cold email to
 * someone who ignored the first is what gets a domain marked as spam, and it
 * is not how the founder wants to sell. Two tracks, both short:
 *
 *   interested — they said yes, the demo went out. +3 days the direct link to
 *                the video, +7 days a last note with the trial. Then silence.
 *   replied    — they wrote something the classifier could not read as yes or
 *                no. One clarification at +2 days, then it waits for a human.
 *
 * Any real inbound reply cancels what is queued (see ingestReply): the point
 * of a follow-up is to get an answer, and an answer arrived.
 *
 * Follow-ups go from the mailbox that sent the cold email, inside the same
 * Gmail conversation, so the person sees one thread rather than a stranger.
 *
 * Every touch has to carry something the previous one did not. The demo goes
 * out through Resend as a designed email in its own thread, which is exactly
 * what Gmail files under Promotions; the first touch therefore hands over the
 * bare video link inside the personal thread instead of asking "did you watch".
 */

import { DateTime } from 'luxon'

import { DEMO_VIDEO_URL } from '@/lib/marketing/landingCopy'
import type { OutboundLocale, ProspectGender } from './types'

/** Hadar's WhatsApp, bare: a prefilled-text link is unreadable in a plain-text email. */
const WHATSAPP_URL = 'https://wa.me/972504343547'

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

/**
 * The demo decides the track, not only the status: a `replied` prospect the
 * founder sent the demo to by hand must not be asked "should I send the demo?".
 */
export function trackFor(status: string, demoEmailSentAt?: string | null): FollowupTrack | null {
  if (status !== 'interested' && status !== 'replied') return null
  if (demoEmailSentAt) return 'interested'
  return status
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
interface HeLines {
  link: string
  story: string
  support: string
  talk: string
  lastSpots: string
  lastTalk: string
  clarify: string
}

const HE_ADDRESSED: HeLines = {
  link: 'שלחתי לך את הסרטון במייל נפרד, ומיילים כאלה נוחתים לפעמים בתיקיית "קידומי מכירות". אז הנה הקישור הישיר, 75 שניות:',
  story: 'רואים שם ביטול אחד מההתחלה ועד הסוף: הורה מבטל בוואטסאפ בערב, מדיניות הביטולים שלך מתמחרת את הביטול, ההורה מאשר את הסכום, והחיוב כבר רשום בחשבון החודשי.',
  support: 'ועוד דבר שחשוב לי שיהיה ברור: אני לא מוסרת מערכת ונעלמת. אני מלווה באופן צמוד את העסקים שמצטרפים, וההקמה נעשית בשלבים, בקצב שמתאים לעסק שלך.',
  talk: 'אם מתאים לך שנדבר, אשמח למספר טלפון ואתקשר. אפשר גם לכתוב לי בוואטסאפ:',
  lastSpots: 'בתקופה הזאת אני מלווה אישית את ההקמה וההטמעה של Lessio בעסקים בגודל שלך: מעבירים יחד את התלמידים מהאקסל, מגדירים את מדיניות הביטולים, ומחברים את הוואטסאפ בשלבים. בגלל שזה ליווי אישי, מספר העסקים שאני מקבלת בכל חודש מוגבל.',
  lastTalk: 'אם זה רלוונטי לך, אשמח למספר טלפון ואתקשר לתאם. אפשר גם לכתוב לי בוואטסאפ:',
  clarify: 'תודה שענית. לא הייתי בטוחה אם לשלוח לך את הסרטון, אז אני שואלת לפני שאני שולחת: 75 שניות שמראות ביטול אחד בוואטסאפ, מההודעה של ההורה ועד החיוב בחשבון החודשי.',
}

const HE_LINES: Record<'f' | 'm' | 'x', HeLines> = {
  f: HE_ADDRESSED,
  m: HE_ADDRESSED,
  x: {
    link: 'שלחתי את הסרטון במייל נפרד, ומיילים כאלה נוחתים לפעמים בתיקיית "קידומי מכירות". אז הנה הקישור הישיר, 75 שניות:',
    story: 'רואים שם ביטול אחד מההתחלה ועד הסוף: הורה מבטל בוואטסאפ בערב, מדיניות הביטולים של העסק מתמחרת את הביטול, ההורה מאשר את הסכום, והחיוב כבר רשום בחשבון החודשי.',
    support: 'ועוד דבר שחשוב לי שיהיה ברור: אני לא מוסרת מערכת ונעלמת. אני מלווה באופן צמוד את העסקים שמצטרפים, וההקמה נעשית בשלבים, בקצב שמתאים לעסק.',
    talk: 'אם מתאים שנדבר, אשמח למספר טלפון ואתקשר. אפשר גם לכתוב לי בוואטסאפ:',
    lastSpots: 'בתקופה הזאת אני מלווה אישית את ההקמה וההטמעה של Lessio בעסקים בסדר גודל כזה: מעבירים יחד את התלמידים מהאקסל, מגדירים את מדיניות הביטולים, ומחברים את הוואטסאפ בשלבים. בגלל שזה ליווי אישי, מספר העסקים שאני מקבלת בכל חודש מוגבל.',
    lastTalk: 'אם זה רלוונטי, אשמח למספר טלפון ואתקשר לתאם. אפשר גם לכתוב לי בוואטסאפ:',
    clarify: 'תודה על התשובה. לא הייתי בטוחה אם לשלוח את הסרטון, אז אני שואלת לפני שאני שולחת: 75 שניות שמראות ביטול אחד בוואטסאפ, מההודעה של ההורה ועד החיוב בחשבון החודשי.',
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
        text: `${hi}\n\nThanks for replying. I was not sure whether you wanted the video, so I am asking before I send it: 75 seconds showing one WhatsApp cancellation, from the parent's message to the charge on the monthly bill.\n\nShould I send it? Answering "yes" is enough.\n\nHadar`,
      }
    }
    if (stage === 0) {
      return {
        subject,
        text: `${hi}\n\nI sent you the video in a separate email, and those sometimes land in Promotions. So here is the direct link, 75 seconds:\n${DEMO_VIDEO_URL}\n\nIt follows one cancellation end to end: a parent cancels on WhatsApp in the evening, your cancellation policy prices it, the parent confirms the amount, and the charge is already on the monthly bill.\n\nOne more thing, because it matters: I do not hand over a system and disappear. I work closely with the businesses that join, and setup happens in stages, at a pace that fits how you run.\n\nIf it makes sense to talk, reply with a phone number and I will call. Or write to me on WhatsApp:\n${WHATSAPP_URL}\n\nHadar`,
      }
    }
    return {
      subject,
      text: `${hi}\n\nLast note from me, and then I stop writing.\n\nRight now I am personally walking businesses your size through setting up Lessio: we move the students over from the spreadsheet together, set the cancellation policy, and connect WhatsApp in stages. Because it is hands-on, the number of businesses I take on each month is limited.\n\nIf that is relevant, reply with a phone number and I will call to set it up. Or write to me on WhatsApp:\n${WHATSAPP_URL}\n\nYou can also start on your own, 30 days free, no credit card:\n${vars.signupUrl}\n\nHadar`,
    }
  }

  const lines = HE_LINES[vars.gender ?? 'x']
  const hi = name ? `היי ${name},` : 'היי,'
  if (track === 'replied') {
    return { subject, text: `${hi}\n\n${lines.clarify}\n\nלשלוח? מספיק לענות "כן".\n\nהדר` }
  }
  if (stage === 0) {
    return {
      subject,
      text: `${hi}\n\n${lines.link}\n${DEMO_VIDEO_URL}\n\n${lines.story}\n\n${lines.support}\n\n${lines.talk}\n${WHATSAPP_URL}\n\nהדר`,
    }
  }
  return {
    subject,
    text: `${hi}\n\nהודעה אחרונה ממני, ואחריה אני לא כותבת שוב.\n\n${lines.lastSpots}\n\n${lines.lastTalk}\n${WHATSAPP_URL}\n\nואפשר גם להתחיל לבד, 30 יום ניסיון בלי כרטיס אשראי:\n${vars.signupUrl}\n\nהדר`,
  }
}
