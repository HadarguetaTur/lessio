/**
 * Platform → org-owner emails about the Lessio subscription itself.
 *
 * These are the only emails Lessio sends about *its own* billing: trial
 * countdown, trial over, renewal ahead, card declined, receipt, cancellation
 * confirmed. Every one links to /account/billing, which is the single place
 * an owner can act. Copy is fixed per locale (not org-customisable) and kept
 * to what the owner needs to decide something.
 */

import { escapeHtml as esc, wrapEmailHtml } from './base'

type Locale = 'he' | 'en'

export interface SaasEmail {
  subject: string
  html: string
}

function money(amount: number): string {
  return `₪${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string, locale: Locale): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  })
}

function layout(locale: Locale, title: string, lines: string[], cta: { label: string; url: string } | null): string {
  const paragraphs = lines
    .map((l) => `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${l}</p>`)
    .join('')
  const button = cta
    ? `<a href="${esc(cta.url)}" style="display:inline-block;margin-top:8px;background-color:#2563eb;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">${esc(cta.label)}</a>`
    : ''
  return wrapEmailHtml(
    `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${esc(title)}</h2>${paragraphs}${button}`,
    locale
  )
}

// ─── Trial ───────────────────────────────────────────────────────────────────

export function trialEndingEmail(
  vars: { orgName: string; daysLeft: number; trialEndsAt: string; billingUrl: string },
  locale: Locale
): SaasEmail {
  const when = fmtDate(vars.trialEndsAt, locale)
  if (locale === 'en') {
    const days = vars.daysLeft === 1 ? 'tomorrow' : `in ${vars.daysLeft} days`
    return {
      subject: `Your Lessio trial ends ${days}`,
      html: layout(
        locale,
        `Your free trial ends ${days}`,
        [
          `The trial for <strong>${esc(vars.orgName)}</strong> ends on ${when}.`,
          'Choose a plan to keep your schedule, WhatsApp automations and parent portal running without interruption. Your data stays exactly as it is either way.',
        ],
        { label: 'Choose a plan', url: vars.billingUrl }
      ),
    }
  }
  const days = vars.daysLeft === 1 ? 'מחר' : `בעוד ${vars.daysLeft} ימים`
  return {
    subject: `תקופת הניסיון ב-Lessio מסתיימת ${days}`,
    html: layout(
      locale,
      `תקופת הניסיון מסתיימת ${days}`,
      [
        `תקופת הניסיון של <strong>${esc(vars.orgName)}</strong> מסתיימת ב-${when}.`,
        'בחרו מסלול כדי שהיומן, האוטומציות בוואטסאפ ופורטל ההורים ימשיכו לעבוד בלי הפסקה. הנתונים שלכם נשמרים בכל מקרה.',
      ],
      { label: 'לבחירת מסלול', url: vars.billingUrl }
    ),
  }
}

export function trialEndedEmail(
  vars: { orgName: string; billingUrl: string },
  locale: Locale
): SaasEmail {
  if (locale === 'en') {
    return {
      subject: 'Your Lessio trial has ended',
      html: layout(
        locale,
        'Your free trial has ended',
        [
          `The trial for <strong>${esc(vars.orgName)}</strong> is over. Your WhatsApp bot, reminders and parent portal are paused, and the dashboard is read-only.`,
          'Everything you built is still there. Pick a plan and it all switches back on immediately.',
        ],
        { label: 'Choose a plan', url: vars.billingUrl }
      ),
    }
  }
  return {
    subject: 'תקופת הניסיון ב-Lessio הסתיימה',
    html: layout(
      locale,
      'תקופת הניסיון הסתיימה',
      [
        `תקופת הניסיון של <strong>${esc(vars.orgName)}</strong> הסתיימה. הבוט בוואטסאפ, התזכורות ופורטל ההורים מושהים, והדשבורד במצב צפייה בלבד.`,
        'כל מה שבניתם נשמר. בחרו מסלול והכל חוזר לפעול מיד.',
      ],
      { label: 'לבחירת מסלול', url: vars.billingUrl }
    ),
  }
}

// ─── Renewal ─────────────────────────────────────────────────────────────────

export function renewalUpcomingEmail(
  vars: { orgName: string; planName: string; amount: number; renewsAt: string; last4: string | null; billingUrl: string },
  locale: Locale
): SaasEmail {
  const when = fmtDate(vars.renewsAt, locale)
  const card = vars.last4 ? (locale === 'en' ? ` ending ${vars.last4}` : ` שמסתיים ב-${vars.last4}`) : ''
  if (locale === 'en') {
    return {
      subject: `Lessio renews on ${when}`,
      html: layout(
        locale,
        'Your subscription renews soon',
        [
          `On ${when} we will charge <strong>${money(vars.amount)}</strong> for the <strong>${esc(vars.planName)}</strong> plan of ${esc(vars.orgName)} to the card${card} on file.`,
          'Nothing to do if that is fine. To change the card or the plan, open billing before then.',
        ],
        { label: 'Manage billing', url: vars.billingUrl }
      ),
    }
  }
  return {
    subject: `המנוי ב-Lessio מתחדש ב-${when}`,
    html: layout(
      locale,
      'המנוי מתחדש בקרוב',
      [
        `ב-${when} נחייב <strong>${money(vars.amount)}</strong> עבור מסלול <strong>${esc(vars.planName)}</strong> של ${esc(vars.orgName)} בכרטיס${card} השמור.`,
        'אם הכל תקין, אין צורך לעשות דבר. כדי להחליף כרטיס או מסלול, היכנסו לניהול החיוב לפני כן.',
      ],
      { label: 'לניהול החיוב', url: vars.billingUrl }
    ),
  }
}

export function paymentFailedEmail(
  vars: {
    orgName: string
    amount: number
    attempt: number
    maxAttempts: number
    nextAttemptAt: string | null
    graceEndsAt: string | null
    last4: string | null
    billingUrl: string
  },
  locale: Locale
): SaasEmail {
  const card = vars.last4 ? (locale === 'en' ? ` ending ${vars.last4}` : ` שמסתיים ב-${vars.last4}`) : ''
  const next = vars.nextAttemptAt ? fmtDate(vars.nextAttemptAt, locale) : null
  const grace = vars.graceEndsAt ? fmtDate(vars.graceEndsAt, locale) : null
  if (locale === 'en') {
    return {
      subject: `Action needed: Lessio payment failed (attempt ${vars.attempt} of ${vars.maxAttempts})`,
      html: layout(
        locale,
        'We could not charge your card',
        [
          `The <strong>${money(vars.amount)}</strong> renewal for ${esc(vars.orgName)} was declined by the card${card} on file.`,
          next
            ? `We will try again on ${next}. To avoid an interruption, update the card now.`
            : 'That was the last automatic attempt. Update the card now to keep the account active.',
          grace ? `If it is still unpaid on ${grace}, the account switches to read-only until it is settled.` : '',
        ].filter(Boolean),
        { label: 'Update payment method', url: vars.billingUrl }
      ),
    }
  }
  return {
    subject: `נדרשת פעולה: החיוב ב-Lessio נכשל (ניסיון ${vars.attempt} מתוך ${vars.maxAttempts})`,
    html: layout(
      locale,
      'לא הצלחנו לחייב את הכרטיס',
      [
        `חידוש המנוי בסך <strong>${money(vars.amount)}</strong> עבור ${esc(vars.orgName)} נדחה על ידי הכרטיס${card} השמור.`,
        next
          ? `ננסה שוב ב-${next}. כדי למנוע הפסקה בשירות, עדכנו את הכרטיס עכשיו.`
          : 'זה היה הניסיון האוטומטי האחרון. עדכנו את הכרטיס עכשיו כדי שהחשבון יישאר פעיל.',
        grace ? `אם החיוב לא יוסדר עד ${grace}, החשבון יעבור למצב צפייה בלבד עד להסדרה.` : '',
      ].filter(Boolean),
      { label: 'לעדכון אמצעי תשלום', url: vars.billingUrl }
    ),
  }
}

export function paymentReceiptEmail(
  vars: {
    orgName: string
    planName: string
    amount: number
    periodStart: string
    periodEnd: string
    documentUrl: string | null
    billingUrl: string
  },
  locale: Locale
): SaasEmail {
  const from = fmtDate(vars.periodStart, locale)
  const to = fmtDate(vars.periodEnd, locale)
  const cta = vars.documentUrl
    ? { label: locale === 'en' ? 'Open invoice' : 'לפתיחת החשבונית', url: vars.documentUrl }
    : { label: locale === 'en' ? 'Manage billing' : 'לניהול החיוב', url: vars.billingUrl }
  if (locale === 'en') {
    return {
      subject: `Lessio receipt — ${money(vars.amount)}`,
      html: layout(
        locale,
        'Thanks — payment received',
        [
          `We charged <strong>${money(vars.amount)}</strong> for the <strong>${esc(vars.planName)}</strong> plan of ${esc(vars.orgName)}.`,
          `This covers ${from} – ${to}. The tax invoice/receipt is issued by Sumit and available from the button below and on your billing page.`,
        ],
        cta
      ),
    }
  }
  return {
    subject: `קבלה מ-Lessio — ${money(vars.amount)}`,
    html: layout(
      locale,
      'תודה — התשלום התקבל',
      [
        `חייבנו <strong>${money(vars.amount)}</strong> עבור מסלול <strong>${esc(vars.planName)}</strong> של ${esc(vars.orgName)}.`,
        `התשלום מכסה את התקופה ${from} – ${to}. חשבונית המס/קבלה מופקת על ידי סאמיט וזמינה בכפתור למטה ובעמוד החיוב.`,
      ],
      cta
    ),
  }
}

export function subscriptionCancelledEmail(
  vars: { orgName: string; endsAt: string | null; billingUrl: string },
  locale: Locale
): SaasEmail {
  const when = vars.endsAt ? fmtDate(vars.endsAt, locale) : null
  if (locale === 'en') {
    return {
      subject: 'Your Lessio subscription has ended',
      html: layout(
        locale,
        'Subscription ended',
        [
          `The subscription for <strong>${esc(vars.orgName)}</strong> ended${when ? ` on ${when}` : ''}, as requested.`,
          'Your data stays readable and exportable. If you change your mind, choose a plan and everything resumes where it left off.',
        ],
        { label: 'Reactivate', url: vars.billingUrl }
      ),
    }
  }
  return {
    subject: 'המנוי ב-Lessio הסתיים',
    html: layout(
      locale,
      'המנוי הסתיים',
      [
        `המנוי של <strong>${esc(vars.orgName)}</strong> הסתיים${when ? ` ב-${when}` : ''}, לפי בקשתכם.`,
        'הנתונים שלכם נשארים זמינים לצפייה ולייצוא. אם תשנו את דעתכם, בחרו מסלול והכל ממשיך מאותה נקודה.',
      ],
      { label: 'להפעלה מחדש', url: vars.billingUrl }
    ),
  }
}
