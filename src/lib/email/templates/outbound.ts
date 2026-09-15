/** The Lessio demo email — sent once to a prospect who answered positively. */

import { escapeHtml as esc } from './base'
import type { SaasEmail } from './saas'

type Locale = 'he' | 'en'

export const DEMO_VIDEO_URL = 'https://youtu.be/LrdokOpDhF0'
const WHATSAPP_SETUP_URL =
  'https://wa.me/972504343547?text=%D7%94%D7%99%D7%99%20%D7%94%D7%93%D7%A8%2C%20%D7%A8%D7%90%D7%99%D7%AA%D7%99%20%D7%90%D7%AA%20%D7%94%D7%A1%D7%A8%D7%98%D7%95%D7%9F%20%D7%A2%D7%9C%20Lessio%20%D7%95%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%91%D7%93%D7%95%D7%A7%20%D7%90%D7%99%D7%9A%20%D7%96%D7%94%20%D7%9E%D7%AA%D7%90%D7%99%D7%9D%20%D7%9C%D7%A2%D7%A1%D7%A7%20%D7%A9%D7%9C%D7%99'
const BLUE = '#2563eb'
const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

function button(label: string, url: string, variant: 'primary' | 'secondary'): string {
  const style = variant === 'primary'
    ? `background-color:${BLUE};color:#ffffff;border:1px solid ${BLUE};`
    : `background-color:#ffffff;color:${BLUE};border:1px solid ${BLUE};`
  return `<a href="${esc(url)}" style="display:inline-block;${style}padding:13px 26px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;font-family:${FONT};">${esc(label)}</a>`
}

function row(icon: string, title: string, text: string): string {
  return `<tr><td width="40" valign="top" style="font-size:22px;line-height:1.2;padding-top:2px;">${icon}</td><td valign="top" style="font-family:${FONT};"><div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:2px;">${title}</div><div style="font-size:14px;line-height:1.55;color:#374151;">${text}</div></td></tr><tr><td colspan="2" style="height:14px;"></td></tr>`
}

interface EmailOptions {
  locale: Locale; preheader: string; greeting: string; intro: string; videoKicker: string; videoTitle: string; videoCta: string
  outcomesTitle: string; outcomes: [string, string][]; trialLine: string; trialCta: string; signupUrl: string
  setupLine: string; whatsappCta: string; whatsappUrl: string; signoff: string; footer: string
}

function shell(opts: EmailOptions): string {
  const dir = opts.locale === 'he' ? 'rtl' : 'ltr'
  const align = opts.locale === 'he' ? 'right' : 'left'
  const o = opts.outcomes
  return `<!DOCTYPE html><html lang="${opts.locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Lessio</title></head><body dir="${dir}" style="margin:0;padding:0;background-color:#f3f4f6;font-family:${FONT};"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(opts.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:28px 0;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="padding:0 8px 14px;text-align:${align};"><span style="display:inline-block;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${INK};">Lessio</span></td></tr><tr><td style="background-color:#ffffff;border-radius:14px;padding:36px 32px;text-align:${align};"><p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${INK};">${opts.greeting}</p><p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:${INK};">${opts.intro}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;border-radius:12px;"><tr><td style="padding:30px 28px;text-align:center;"><div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#93c5fd;text-transform:uppercase;margin-bottom:8px;">${esc(opts.videoKicker)}</div><div style="font-size:21px;font-weight:800;line-height:1.35;color:#ffffff;margin-bottom:20px;">${esc(opts.videoTitle)}</div><a href="${esc(DEMO_VIDEO_URL)}" style="display:inline-block;background-color:#ffffff;color:#0f172a;padding:14px 28px;border-radius:999px;text-decoration:none;font-size:15px;font-weight:700;">▶&nbsp;&nbsp;${esc(opts.videoCta)}</a></td></tr></table><p style="margin:30px 0 16px;font-size:13px;font-weight:700;letter-spacing:1px;color:${MUTED};text-transform:uppercase;">${esc(opts.outcomesTitle)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}">${row('📚', o[0]![0], o[0]![1])}${row('🏫', o[1]![0], o[1]![1])}${row('🕊️', o[2]![0], o[2]![1])}</table><hr style="border:0;border-top:1px solid ${LINE};margin:16px 0 26px;"><p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${INK};">${opts.trialLine}</p><div style="text-align:${align};">${button(opts.trialCta, opts.signupUrl, 'primary')}</div><p style="margin:28px 0 14px;font-size:15px;line-height:1.6;color:#374151;">${opts.setupLine}</p><div style="text-align:${align};">${button(opts.whatsappCta, opts.whatsappUrl, 'secondary')}</div><p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:${INK};">${opts.signoff}</p></td></tr><tr><td style="padding:18px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;">${opts.footer}<br><a href="https://www.getlessio.com" style="color:#9ca3af;">getlessio.com</a></td></tr></table></td></tr></table></body></html>`
}

function unsubFooter(url: string | undefined, locale: Locale): string {
  const base = locale === 'en' ? 'You got this because you replied to our email.' : 'קיבלת את המייל הזה כי ענית למייל שלנו.'
  if (url) return locale === 'en' ? `${base} <a href="${esc(url)}" style="color:#9ca3af;">One click and we stop</a>.` : `${base} <a href="${esc(url)}" style="color:#9ca3af;">בלחיצה אחת אנחנו מפסיקים</a>.`
  return locale === 'en' ? `${base} Not relevant? Reply "remove" and we will not write again.` : `${base} לא רלוונטי? השיבו "הסר" ולא נכתוב שוב.`
}

export function demoEmail(vars: { firstName: string | null; signupUrl: string; unsubscribeUrl?: string }, locale: Locale): SaasEmail {
  const en = locale === 'en'
  const name = vars.firstName ? esc(vars.firstName) : ''
  return { subject: en ? 'The Lessio video you asked for' : 'הסרטון שביקשת על Lessio', html: shell({
    locale,
    preheader: en ? 'Spend less time running the business around your teaching.' : 'פחות זמן לנהל את מה שמסביב, יותר זמן ללמד.',
    greeting: name ? (en ? `Hi ${name},` : `היי ${name},`) : en ? 'Hi,' : 'היי,',
    intro: en ? 'Thanks for replying. Here is a quick look at Lessio: less chasing messages, lessons, payments and reminders, and more time to teach and run the business.' : 'כיף שענית. הנה הצצה קצרה ל-Lessio: פחות רדיפה אחרי הודעות, שיעורים, תשלומים ותזכורות, ויותר זמן ללמד ולנהל את העסק.',
    videoKicker: en ? 'A quick look at Lessio' : 'הצצה קצרה ל-Lessio',
    videoTitle: en ? 'The system around your teaching, in one place' : 'כל מה שמסביב להוראה, במקום אחד',
    videoCta: en ? 'Watch the video' : 'לצפייה בסרטון',
    outcomesTitle: en ? 'Built for the way you work' : 'מתאים לאיך שאתם עובדים',
    outcomes: en ? [['For busy tutors', 'Students, lessons, payments, reminders and parents are all managed in one place, instead of across WhatsApp, spreadsheets and memory.'], ['For learning centres and teaching teams', 'Each teacher works with their own schedule and students, while you keep one clear view of the operation.'], ['A calmer day-to-day', 'Let the system handle the routine follow-up around lessons, so you can focus on teaching and the people in front of you.']] : [['למורים עם הרבה תלמידים', 'תלמידים, שיעורים, תשלומים, תזכורות והורים מנוהלים במקום אחד, במקום בוואטסאפ, אקסל וזיכרון.'], ['למרכזי לימוד וצוותי מורים', 'כל מורה עובד עם היומן והתלמידים שלו, ואתם רואים את כל הפעילות במקום אחד.'], ['יום־יום שקט יותר', 'המערכת מטפלת בפעולות שמסביב לשיעורים, כדי שתוכלו להתמקד בהוראה ובאנשים שמולכם.']],
    trialLine: en ? '<strong>Try it with your own students.</strong> 30 days free, no credit card, and the trial includes the full Studio plan.' : '<strong>הכי פשוט לנסות על התלמידים שלכם.</strong> 30 יום ניסיון, בלי כרטיס אשראי, כולל מסלול סטודיו המלא.',
    trialCta: en ? 'Start 30 days free' : 'להתחיל 30 יום ניסיון', signupUrl: vars.signupUrl,
    setupLine: en ? 'Need help getting started? We provide close support for setup, implementation and adoption.' : 'רוצים עזרה בהתחלה? תקבלו ליווי צמוד להקמה, הטמעה ויישום.',
    whatsappCta: en ? 'Talk to us on WhatsApp' : 'לדבר איתנו בוואטסאפ', whatsappUrl: WHATSAPP_SETUP_URL,
    signoff: en ? 'Hadar<br><span style="color:#6b7280;font-size:14px;">Founder, Lessio</span>' : 'הדר<br><span style="color:#6b7280;font-size:14px;">מייסדת, Lessio</span>',
    footer: unsubFooter(vars.unsubscribeUrl, locale),
  }) }
}
