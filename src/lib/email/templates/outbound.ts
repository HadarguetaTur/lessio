/**
 * The Lessio demo email — sent automatically, once, to a prospect who
 * answered a cold email positively.
 *
 * The cold email is deliberately plain (a person typing in Gmail); this one
 * is the designed, sales-facing follow-up: a 75-second product video as the
 * hero, three concrete outcomes, and the trial CTA. Copy stays inside what
 * the landing page is allowed to claim (src/lib/marketing/landingCopy.ts):
 * the WhatsApp cancellation chain, 30 days free, no credit card, the full
 * Studio plan in the trial. The Hebrew word for a tier is «מסלול»
 * (decision #39). Replying to the email is how a walkthrough is booked.
 */

import { escapeHtml as esc } from './base'
import type { SaasEmail } from './saas'

type Locale = 'he' | 'en'

export const DEMO_VIDEO_URL = 'https://youtu.be/CxBznM_3T6M'

const BLUE = '#2563eb'
const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

function button(label: string, url: string, variant: 'primary' | 'secondary'): string {
  const style =
    variant === 'primary'
      ? `background-color:${BLUE};color:#ffffff;border:1px solid ${BLUE};`
      : `background-color:#ffffff;color:${BLUE};border:1px solid ${BLUE};`
  return `<a href="${esc(url)}" style="display:inline-block;${style}padding:13px 26px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;font-family:${FONT};">${esc(label)}</a>`
}

function row(icon: string, title: string, text: string): string {
  const iconCell = `<td width="40" valign="top" style="font-size:22px;line-height:1.2;padding-top:2px;">${icon}</td>`
  const textCell = `<td valign="top" style="font-family:${FONT};"><div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:2px;">${title}</div><div style="font-size:14px;line-height:1.55;color:#374151;">${text}</div></td>`
  return `<tr>${iconCell}${textCell}</tr><tr><td colspan="2" style="height:14px;"></td></tr>`
}

function shell(opts: {
  locale: Locale
  preheader: string
  greeting: string
  intro: string
  videoKicker: string
  videoTitle: string
  videoCta: string
  outcomesTitle: string
  outcomes: [string, string][]
  trialLine: string
  trialCta: string
  signupUrl: string
  walkthrough: string
  signoff: string
  footer: string
}): string {
  const dir = opts.locale === 'he' ? 'rtl' : 'ltr'
  const align = opts.locale === 'he' ? 'right' : 'left'
  const o = opts.outcomes
  return `<!DOCTYPE html>
<html lang="${opts.locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Lessio</title></head>
<body dir="${dir}" style="margin:0;padding:0;background-color:#f3f4f6;font-family:${FONT};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:28px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr><td style="padding:0 8px 14px;text-align:${align};">
          <span style="display:inline-block;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${INK};">Lessio</span>
        </td></tr>

        <tr><td style="background-color:#ffffff;border-radius:14px;padding:36px 32px;text-align:${align};">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${INK};">${opts.greeting}</p>
          <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:${INK};">${opts.intro}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:12px;">
            <tr><td style="padding:30px 28px;text-align:center;">
              <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#93c5fd;text-transform:uppercase;margin-bottom:8px;">${esc(opts.videoKicker)}</div>
              <div style="font-size:21px;font-weight:800;line-height:1.35;color:#ffffff;margin-bottom:20px;">${esc(opts.videoTitle)}</div>
              <a href="${esc(DEMO_VIDEO_URL)}" style="display:inline-block;background-color:#ffffff;color:#0f172a;padding:14px 28px;border-radius:999px;text-decoration:none;font-size:15px;font-weight:700;">▶&nbsp;&nbsp;${esc(opts.videoCta)}</a>
            </td></tr>
          </table>

          <p style="margin:30px 0 16px;font-size:13px;font-weight:700;letter-spacing:1px;color:${MUTED};text-transform:uppercase;">${esc(opts.outcomesTitle)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}">
            ${row('📲', o[0]![0], o[0]![1])}
            ${row('🧾', o[1]![0], o[1]![1])}
            ${row('🗓️', o[2]![0], o[2]![1])}
          </table>

          <hr style="border:0;border-top:1px solid ${LINE};margin:16px 0 26px;">

          <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${INK};">${opts.trialLine}</p>
          <div style="text-align:${align};">${button(opts.trialCta, opts.signupUrl, 'primary')}</div>

          <p style="margin:28px 0 0;font-size:15px;line-height:1.6;color:#374151;">${opts.walkthrough}</p>
          <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:${INK};">${opts.signoff}</p>
        </td></tr>

        <tr><td style="padding:18px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;">
          ${opts.footer}<br><a href="https://www.getlessio.com" style="color:#9ca3af;">getlessio.com</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function demoEmail(
  vars: { firstName: string | null; signupUrl: string },
  locale: Locale
): SaasEmail {
  if (locale === 'en') {
    const name = vars.firstName ? esc(vars.firstName) : ''
    return {
      subject: 'The Lessio demo you asked for, in 75 seconds',
      html: shell({
        locale,
        preheader: 'One parent cancellation, from WhatsApp message to bill, with no manual updates.',
        greeting: name ? `Hi ${name},` : 'Hi,',
        intro:
          'Thanks for replying. Instead of a long explanation, here is Lessio handling the moment every tutoring business knows: a parent cancels a lesson on WhatsApp, and everything that has to happen next happens on its own.',
        videoKicker: 'Watch the demo',
        videoTitle: 'What happens on WhatsApp updates your business automatically',
        videoCta: 'Watch, 75 seconds',
        outcomesTitle: 'What you get',
        outcomes: [
          ['Parents run their side on WhatsApp', 'Booking, cancelling, paying and homework, through your own business number. No app to install, no calls to you.'],
          ['The bill is right at month end', 'Every lesson, cancellation and policy charge lands on the right account. The payment request goes out on its own; the receipt is issued by your accounting provider.'],
          ['Every teacher sees only their day', 'One calendar, per-teacher availability, conflicts caught before they are booked. You see the whole business on one screen.'],
        ],
        trialLine: '<strong>Try it on your own students.</strong> 30 days free, no credit card, and the trial includes the full Studio plan.',
        trialCta: 'Start 30 days free',
        signupUrl: vars.signupUrl,
        walkthrough: 'Prefer a 15-minute walkthrough on your own schedule first? Just reply to this email with a time that suits you.',
        signoff: 'Hadar<br><span style="color:#6b7280;font-size:14px;">Founder, Lessio</span>',
        footer: 'You got this because you replied to our email. Not relevant? Reply "remove" and we will not write again.',
      }),
    }
  }

  const name = vars.firstName ? esc(vars.firstName) : ''
  return {
    subject: 'הדמו של Lessio שביקשת, ב-75 שניות',
    html: shell({
      locale,
      preheader: 'הורה מבטל בוואטסאפ. היומן, החיוב והחשבון מתעדכנים לבד.',
      greeting: name ? `היי ${name},` : 'היי,',
      intro:
        'תודה שענית. במקום הסבר ארוך, הנה Lessio בפעולה על הסיטואציה שכל עסק הוראה מכיר: הורה מבטל שיעור בוואטסאפ, וכל מה שצריך לקרות אחרי זה קורה לבד.',
      videoKicker: 'דמו קצר',
      videoTitle: 'מה שקורה בוואטסאפ מתעדכן אוטומטית בעסק',
      videoCta: 'לצפייה, 75 שניות',
      outcomesTitle: 'מה זה נותן לך',
      outcomes: [
        ['ההורים מסתדרים לבד בוואטסאפ', 'קובעים, מבטלים, משלמים ורואים שיעורי בית מול המספר העסקי שלך. בלי אפליקציה, בלי טלפונים אלייך.'],
        ['סוף החודש כבר סגור', 'כל שיעור, ביטול וחיוב לפי המדיניות שלך נרשמים על החשבון הנכון. בקשת התשלום יוצאת לבד, והקבלה מופקת אצל ספק החשבונאות שלך.'],
        ['כל מורה רואה רק את היום שלו', 'יומן אחד לכל הצוות, זמינות לכל מורה, והתנגשויות נתפסות לפני שנקבעות. את רואה את כל העסק במסך אחד.'],
      ],
      trialLine: '<strong>הכי פשוט לנסות על התלמידים שלך.</strong> 30 יום ניסיון, בלי כרטיס אשראי, כולל מסלול סטודיו המלא.',
      trialCta: 'התחילו 30 יום ניסיון',
      signupUrl: vars.signupUrl,
      walkthrough: 'מעדיפה קודם סיור קצר של 15 דקות איתי? פשוט השיבי למייל הזה עם שעה שנוחה לך.',
      signoff: 'הדר<br><span style="color:#6b7280;font-size:14px;">מייסדת, Lessio</span>',
      footer: 'קיבלת את המייל הזה כי ענית למייל שלנו. לא רלוונטי? השיבי "הסר" ולא נכתוב שוב.',
    }),
  }
}
