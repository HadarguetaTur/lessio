/**
 * The Lessio demo email — sent automatically, once, to a prospect who
 * answered a cold email positively.
 *
 * Copy stays inside what the landing page is allowed to claim
 * (src/lib/marketing/landingCopy.ts): the WhatsApp cancellation chain, 30 days
 * free, no credit card, the full Studio plan in the trial. The Hebrew word for
 * a tier is «מסלול» (decision #39). Replying to the email is the demo booking
 * — no calendar link exists yet, and a human answering a warm reply is the
 * right V1 anyway.
 */

import { escapeHtml as esc } from './base'
import { layout, type SaasEmail } from './saas'

type Locale = 'he' | 'en'

export function demoEmail(
  vars: { firstName: string | null; signupUrl: string },
  locale: Locale
): SaasEmail {
  if (locale === 'en') {
    const hi = vars.firstName ? `Hi ${esc(vars.firstName)},` : 'Hi,'
    return {
      subject: 'Lessio — the demo you asked for',
      html: layout(
        locale,
        'What happens on WhatsApp updates your business automatically',
        [
          hi,
          'Thanks for the reply. Here is the short version of what Lessio does for a tutoring business.',
          'A parent cancels a lesson on WhatsApp. Lessio connects that message to the lesson, your cancellation policy, the charge and the schedule — with no manual updates. At month end the bill is already right, the payment request goes out on its own, and the receipt is issued by your accounting provider.',
          'Parents book, cancel, pay and see homework from WhatsApp and a small parent portal. Teachers see only their own day. You see the whole business on one screen.',
          '<strong>Try it on your own students:</strong> 30 days free, no credit card, and the trial includes the full Studio plan.',
          'Prefer a 15-minute walkthrough first? Just reply to this email with a time that suits you.',
        ],
        { label: 'Start 30 days free', url: vars.signupUrl }
      ),
    }
  }

  const hi = vars.firstName ? `היי ${esc(vars.firstName)},` : 'היי,'
  return {
    subject: 'Lessio — הדמו שביקשת',
    html: layout(
      locale,
      'מה שקורה בוואטסאפ, מתעדכן אוטומטית בעסק',
      [
        hi,
        'תודה על התשובה. הנה בקצרה מה Lessio עושה לעסק הוראה.',
        'הורה מבטל שיעור בוואטסאפ. Lessio מחברת את ההודעה לשיעור, למדיניות הביטול, לחיוב וליומן — בלי לעדכן כלום ידנית. בסוף החודש החשבון כבר נכון, בקשת התשלום יוצאת לבד, והקבלה מופקת אצל ספק החשבונאות שלך.',
        'הורים קובעים, מבטלים, משלמים ורואים שיעורי בית מהוואטסאפ ומפורטל הורים קטן. מורים רואים רק את היום שלהם. את/ה רואה את כל העסק במסך אחד.',
        '<strong>אפשר לנסות על התלמידים שלך:</strong> 30 יום ניסיון, בלי כרטיס אשראי, והניסיון כולל את מסלול סטודיו המלא.',
        'מעדיפים קודם הדרכה קצרה של 15 דקות? פשוט השיבו למייל הזה עם שעה שנוחה לכם.',
      ],
      { label: 'התחילו 30 יום ניסיון', url: vars.signupUrl }
    ),
  }
}
