/**
 * Landing copy — short, sharp Hebrew + English parallel.
 *
 * House style (also used by docs/video-brand-script.md): short sentences,
 * no exclamation points, no promises the code can't keep. The page tells one
 * story — a parent's WhatsApp message becoming a priced charge, a freed slot
 * and a line on the monthly bill — and everything else hangs off that rail.
 * English is written natively, not translated sentence-by-sentence.
 *
 * Every product claim here is backed by shipped behavior. Things that are NOT
 * claimable (and must stay out): free-text NLU ("Noa won't come tomorrow" is
 * not parsed — the flow is button/menu driven), WhatsApp rescheduling (demo
 * flag only), Google Calendar two-way sync (read-only conflict detection),
 * a broad "AI secretary" (the copilot classifies and always requires a
 * confirm tap), "only we have official WhatsApp" or any claim about
 * competitors, testimonials/metrics (none exist yet).
 */

/** Screenshot assets under public/landing/{he,en}/<key>.webp */
export type LandingImageKey =
  | 'wa-cancel-flow'
  | 'dash-attention-tick'
  | 'calendar-week'
  | 'billing-detail'
  | 'dash-overview'
  | 'billing-table'
  | 'wa-payment-request'
  | 'portal-payments'
  | 'portal-book'
  | 'teachers'
  | 'homework-board'
  | 'reports-revenue'

/** Dashboard frames are 1920×1080; phone captures are 780×1688.
 *  billing-detail is cropped to 1920×720 — the source frame's lower half says
 *  "no cancellations this month", which would contradict the ₪60 story. */
export const LANDING_IMAGE_SIZES: Record<LandingImageKey, { width: number; height: number }> = {
  'wa-cancel-flow': { width: 780, height: 1688 },
  'dash-attention-tick': { width: 1920, height: 1080 },
  'calendar-week': { width: 1920, height: 1080 },
  'billing-detail': { width: 1920, height: 720 },
  'dash-overview': { width: 1920, height: 1080 },
  'billing-table': { width: 1920, height: 1080 },
  'wa-payment-request': { width: 780, height: 1688 },
  'portal-payments': { width: 780, height: 1688 },
  'portal-book': { width: 780, height: 1688 },
  teachers: { width: 1920, height: 1080 },
  'homework-board': { width: 1920, height: 1080 },
  'reports-revenue': { width: 1920, height: 1080 },
}

export function landingImageSrc(locale: string, key: LandingImageKey): string {
  return `/landing/${locale === 'en' ? 'en' : 'he'}/${key}.webp`
}

/** One bubble in the hero chat. Mirrors the real cancellation flow verbatim. */
export type LandingChatMessage = {
  from: 'parent' | 'business'
  lines: readonly string[]
  time: string
  /** Interactive affordance rendered under the bubble, as in real WhatsApp. */
  buttons?: readonly string[]
  /** Marks the ₪60 line so the chat and the dashboard card can highlight it. */
  highlight?: boolean
}

const landingEnCore = {
  hero: {
    eyebrow: 'The operating system for tutoring businesses',
    headline: 'A parent cancels on WhatsApp. Lessio closes the loop.',
    subheadline:
      'Your cancellation policy prices it, the charge is recorded, the slot opens up — and the monthly bill already knows.',
    ctaPrimary: 'Start 30 days free',
    ctaPrimaryNote: 'No credit card.',
    ctaSecondary: 'See how it works',
    trustLine: "Built on Meta's official WhatsApp Business Platform",
    chat: {
      contactName: 'Michal Music Studio',
      statusLabel: 'online',
      messages: [
        { from: 'parent', lines: ['Cancel a lesson'], time: '21:40' },
        {
          from: 'business',
          lines: ['Which lesson should we cancel? Upcoming lessons:'],
          time: '21:40',
          buttons: ['Choose a lesson'],
        },
        {
          from: 'business',
          lines: ['Cancel Noa Levi’s lesson on 31/08 at 14:00?'],
          time: '21:41',
          buttons: ['Yes, cancel', 'No, go back'],
        },
        {
          from: 'business',
          lines: [
            'Lesson cancelled ✅',
            'Noa Levi with Michal Abramov',
            '31/08 at 14:00',
            'Partial cancellation charge: ₪60',
          ],
          time: '21:41',
          highlight: true,
        },
      ] as readonly LandingChatMessage[],
    },
    dashCard: {
      title: 'Needs attention',
      line: 'Cancellation charge — Noa Levi',
      amount: '₪60',
      slot: 'The 14:00 slot is open again on the calendar',
    },
  },
  chain: {
    title: 'One cancellation, from message to bill',
    intro: 'This is not a metaphor. It is exactly what the system does, step by step.',
    beats: [
      {
        title: 'The parent cancels on WhatsApp',
        body: 'Tap "cancel", pick the lesson, confirm. No new app, no phone calls, no waiting for the morning.',
        image: 'wa-cancel-flow' as const,
      },
      {
        title: 'Your policy prices it',
        body: 'You set the rules once — say, full charge inside 24 hours, 50% inside two. The system does the math, and the parent sees the amount before confirming.',
        image: null,
      },
      {
        title: 'The charge is already on your dashboard',
        body: 'The line shows up under "Needs attention" in real time. You did not touch anything.',
        image: 'dash-attention-tick' as const,
      },
      {
        title: 'The calendar updates itself',
        body: 'The slot opens up, and other parents can book straight into it.',
        image: 'calendar-week' as const,
      },
      {
        title: 'At month end, it is all there',
        body: 'Each student’s bill builds itself from lessons, subscriptions and cancellations. You approve, the parent gets a payment request on WhatsApp, the receipt goes out on its own.',
        image: 'billing-detail' as const,
      },
    ],
    policyCard: {
      title: 'Cancellation policy',
      rules: ['Up to 24 hours — full charge', 'Up to 2 hours — 50%'],
      result: 'Partial cancellation charge: ₪60',
    },
  },
  problem: {
    title: 'Without a system, that same cancellation becomes your job.',
    items: [
      {
        title: 'The charge never goes out',
        body: 'The lesson is cancelled, nobody is billed, and the revenue simply disappears.',
      },
      {
        title: 'The slot stays empty',
        body: 'You find out about the cancellation tomorrow — when it is too late to fill it.',
      },
      {
        title: 'There is no single version of the truth',
        body: 'WhatsApp, the spreadsheet and your memory tell three different stories.',
      },
    ],
    closing: 'What does not close in the system is lost in the day-to-day.',
  },
  capabilities: {
    title: 'Everything else runs on the same rail',
    intro:
      'Cancellations are just the opening act. Every movement in the business — a lesson, a payment, a message — lands in the same record.',
    items: [
      {
        title: 'Booking and scheduling',
        body: 'Parents book through a link, against your teachers’ real availability — no back-and-forth with staff.',
        image: 'portal-book' as const,
      },
      {
        title: 'Monthly billing that builds itself',
        body: 'Each student’s bill assembles from lessons, subscriptions and cancellations. One approval, and the payment request goes out.',
        image: 'billing-table' as const,
      },
      {
        title: 'Messages that send themselves',
        body: 'Lesson reminders, payment requests, homework reminders and receipts — in Hebrew or English, on the official channel.',
        image: 'wa-payment-request' as const,
      },
      {
        title: 'Parent self-service',
        body: 'Schedule, balance, payment links, receipts, homework and the portal — one WhatsApp message or one link, nothing to install.',
        image: 'portal-payments' as const,
      },
      {
        title: 'Teachers and operations',
        body: 'Teachers, students, groups, availability, day-off requests and lesson records — with clear role separation.',
        image: 'teachers' as const,
      },
      {
        title: 'Reports that look forward',
        body: 'Revenue, debts, cancellation rates and a forecast. See where the business is going, not just where it was.',
        image: 'reports-revenue' as const,
      },
    ],
  },
  israel: {
    title: 'Built for how tutoring businesses work in Israel',
    items: [
      'Bit, PayBox, Cardcom, PayPlus, Stripe and Grow',
      'Receipts through licensed Israeli providers',
      'A bot that answers in Hebrew and English',
      'Jewish holidays load themselves into the calendar',
      'Cancellation policies from the lessons world, not retail',
    ],
  },
  trust: {
    title: 'Automation with a seatbelt',
    items: [
      {
        title: "Meta's official channel",
        body: 'The WhatsApp Business Platform, with your own business number and approved templates. No unofficial automations, no browser workarounds, no risk to your number.',
      },
      {
        title: 'You reply — the bot goes quiet',
        body: 'Answered a parent yourself from the dashboard? The bot steps out of that conversation for six hours. No double replies.',
      },
      {
        title: 'Nothing happens without a confirmation',
        body: 'The parent confirms before a cancellation. You approve before a charge is sent. The AI suggests — it never acts on its own.',
      },
      {
        title: 'Parents stay in control',
        body: 'One "stop" message halts everything. Data is deleted on a defined retention schedule.',
      },
    ],
  },
  audience: {
    title: 'Lessio was not built for every tutor. It was built for a business.',
    subtitle:
      'For the moment teaching has already become a business — dozens of students, several teachers, and billing you can no longer keep in your head.',
    forTitle: 'Good fit',
    forBullets: [
      'Private tutor with real operational load',
      'Center with several teachers or several rooms',
      'A business that is growing and needs infrastructure that keeps pace',
      'You want orderly billing without chasing payments yourself',
    ] as const,
    notForTitle: 'Not a fit',
    notForBullets: [
      'Few students and day-to-day is still simple',
      'You only need a basic calendar',
      'Not looking to change how the business works',
    ] as const,
    closing:
      'Not every business needs a system like this. But a business that is already running should not have to keep holding itself together manually.',
  },
  // Prices are NOT here. They are read from saas_plans at render time via
  // getPublicPricingRows(), so the page and the catalog cannot drift apart.
  pricing: {
    title: 'One price per business, by number of teachers',
    intro:
      'Every plan includes WhatsApp, billing, receipts, the parent portal and homework. What changes is how many teachers you run.',
    monthlyLabel: 'Monthly',
    yearlyLabel: 'Yearly',
    perMonth: '/ month',
    perYear: '/ year',
    yearlyNote: 'Yearly billing is two months free.',
    // Paired with PRICES_INCLUDE_VAT in src/lib/saas/pricing.ts — the company
    // is VAT-exempt, so the price shown is the price charged. Both change on
    // the day it registers for VAT.
    vatNote: 'Prices are final — no VAT is added.',
    teachersOne: '1 teacher',
    teachersUpTo: 'Up to {count} teachers',
    teachersUnlimited: 'Unlimited teachers',
    cta: 'Start 30 days free',
    trialNote: '30 days free. No credit card.',
    trialIncludes: 'The trial includes the full Studio plan.',
  },
  faq: {
    title: 'Frequently asked questions',
    items: [
      {
        question: 'Is this for everyone who teaches?',
        opening: 'No.',
        rest: [
          'Lessio was not built for every teacher. It was built for a business.',
          'If operations are still very simple, you probably do not need a system like this yet. If the business is already running - that is exactly the stage.',
        ],
      },
      {
        question: 'Is this official WhatsApp?',
        opening: 'Yes.',
        rest: [
          "Lessio runs on Meta's WhatsApp Business Platform, connected through Meta's guided setup, with approved message templates. No unofficial automations, no phone that has to stay on, no risk of your number being blocked.",
        ],
      },
      {
        question: 'Do I need a new number?',
        opening: 'You connect a dedicated business number through Meta.',
        rest: [
          'An existing number can be migrated to the business platform, but most businesses prefer a separate one - the personal line stays personal.',
        ],
      },
      {
        question: 'How do parents use Lessio?',
        opening: 'They install nothing.',
        rest: [
          'They write to your business WhatsApp and get a menu: cancel, book, balance, receipts, portal. Anyone who prefers the portal signs in with a one-time code.',
        ],
      },
      {
        question: 'How long does switching take?',
        opening: 'You can work from day one.',
        rest: [
          'Setup is guided, and students, parents and lessons come in from a spreadsheet import - not retyping. Connecting WhatsApp through Meta is the longest step, and the system works before it too.',
        ],
      },
      {
        question: 'What happens when a parent cancels?',
        opening: 'Your policy decides.',
        rest: [
          'You set the cancellation window and charge percentages once. From then on every cancellation is priced on its own, the parent sees the amount before confirming, and the charge lands on the monthly bill.',
        ],
      },
      {
        question: 'I do not have time to roll this out right now.',
        opening: 'In most cases, that is exactly the point.',
        rest: [
          'A proper rollout takes time once. Operational chaos takes time every week.',
        ],
      },
      {
        question: 'What if I already "make do" with the tools I have?',
        rest: [
          'If everything is truly closed, clear, and documented - you probably do not need to change.',
          'But if there is overload, chasing, lack of clarity, and a feeling that the business is held together by hand - Lessio was built for exactly that.',
        ],
      },
    ],
  },
  finalCta: {
    title: 'The next cancellation is coming either way.',
    body: 'The only question is how much work it leaves behind.',
    cta: 'Start 30 days free',
    note: '30 days free. No credit card. The trial includes the full Studio plan.',
  },
  footer: {
    statusLabel: 'System live',
    domain: 'getlessio.com',
    legalNavLabel: 'Legal',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    dataDeletion: 'Data deletion',
    addressLabel: 'Address',
    supportLabel: 'Support',
  },
  nav: {
    login: 'Sign in',
    signup: 'Start free',
    howItWorks: 'How it works',
    pricing: 'Pricing',
    faq: 'FAQ',
  },
  meta: {
    title: 'LESSIO — The operating system for tutoring businesses',
    description:
      'A parent cancels on WhatsApp and Lessio closes the loop: your policy prices it, the charge is recorded, the calendar updates, the monthly bill already knows. 30 days free, no credit card.',
  },
} as const

const landingHeCore = {
  hero: {
    eyebrow: 'מערכת ההפעלה לעסקי הוראה',
    headline: 'הודעת ביטול נכנסת ב-21:40. עד 21:41 היא כבר מתומחרת, ביומן ובחיוב החודשי.',
    subheadline:
      'ההורה מבטל בוואטסאפ. Lessio מפעילה את מדיניות הביטולים שלך, רושמת את החיוב, מפנה את המשבצת — והכול כבר בחשבון החודשי.',
    ctaPrimary: 'התחילו 30 יום ניסיון',
    ctaPrimaryNote: 'בלי כרטיס אשראי.',
    ctaSecondary: 'איך זה עובד',
    trustLine: 'מחוברת ל-WhatsApp Business Platform הרשמית של Meta',
    chat: {
      contactName: 'סטודיו מיכל למוזיקה',
      statusLabel: 'מקוון',
      messages: [
        { from: 'parent', lines: ['ביטול שיעור'], time: '21:40' },
        {
          from: 'business',
          lines: ['איזה שיעור לבטל? הנה השיעורים הקרובים:'],
          time: '21:40',
          buttons: ['בחירת שיעור'],
        },
        {
          from: 'business',
          lines: ['לבטל את השיעור של נועה לוי ב-31/08 בשעה 14:00?'],
          time: '21:41',
          buttons: ['כן, לבטל', 'לא, חזרה'],
        },
        {
          from: 'business',
          lines: [
            'השיעור בוטל ✅',
            'נועה לוי עם מיכל אברמוב',
            '31/08 בשעה 14:00',
            'חיוב ביטול חלקי: 60₪',
          ],
          time: '21:41',
          highlight: true,
        },
      ] as readonly LandingChatMessage[],
    },
    dashCard: {
      title: 'דורש טיפול',
      line: 'חיוב ביטול — נועה לוי',
      amount: '₪60',
      slot: 'המשבצת של 14:00 התפנתה ביומן',
    },
  },
  chain: {
    title: 'ביטול אחד, מההודעה ועד החיוב',
    intro: 'זה לא משל. זה בדיוק מה שהמערכת עושה, צעד אחרי צעד.',
    beats: [
      {
        title: 'ההורה מבטל בוואטסאפ',
        body: 'לחיצה על "ביטול שיעור", בחירת שיעור, אישור. בלי אפליקציה חדשה, בלי טלפונים, בלי לחכות לבוקר.',
        image: 'wa-cancel-flow' as const,
      },
      {
        title: 'המדיניות שלך מתמחרת',
        body: 'קובעים את הכללים פעם אחת — למשל חיוב מלא עד 24 שעות, 50% עד שעתיים. המערכת מחשבת לבד, וההורה רואה את הסכום עוד לפני שהוא מאשר.',
        image: null,
      },
      {
        title: 'החיוב כבר בלוח הבקרה',
        body: 'השורה מופיעה ב"דורש טיפול" בזמן אמת. בלי שנגעת בכלום.',
        image: 'dash-attention-tick' as const,
      },
      {
        title: 'היומן מתעדכן לבד',
        body: 'המשבצת מתפנה, והורים אחרים יכולים לקבוע אליה שיעור בקישור.',
        image: 'calendar-week' as const,
      },
      {
        title: 'ובסוף החודש — הכול כבר שם',
        body: 'החשבון של כל תלמיד נבנה לבד משיעורים, מנויים וביטולים. מאשרים, ההורה מקבל בקשת תשלום בוואטסאפ, והקבלה יוצאת לבד.',
        image: 'billing-detail' as const,
      },
    ],
    policyCard: {
      title: 'מדיניות ביטולים',
      rules: ['עד 24 שעות — חיוב מלא', 'עד שעתיים — 50%'],
      result: 'חיוב ביטול חלקי: 60₪',
    },
  },
  problem: {
    title: 'ובלי מערכת? אותו ביטול הופך לעוד משימה שלך.',
    items: [
      {
        title: 'החיוב לא יוצא',
        body: 'השיעור בוטל, אף אחד לא חויב, וההכנסה פשוט נעלמת.',
      },
      {
        title: 'המשבצת נשארת ריקה',
        body: 'על הביטול מגלים מחר — כשכבר מאוחר מדי למלא אותה.',
      },
      {
        title: 'אין גרסה אחת של האמת',
        body: 'הוואטסאפ, האקסל והזיכרון מספרים שלושה סיפורים שונים.',
      },
    ],
    closing: 'מה שלא נסגר במערכת, הולך לאיבוד בשוטף.',
  },
  capabilities: {
    title: 'כל השוטף רץ על אותה מסילה',
    intro:
      'ביטולים הם רק הפתיח. כל תנועה בעסק — שיעור, תשלום, הודעה — נרשמת באותה מערכת.',
    items: [
      {
        title: 'קביעות ותיאום',
        body: 'הורים קובעים שיעור בקישור, מול הזמינות האמיתית של המורים — בלי פינג-פונג מול הצוות.',
        image: 'portal-book' as const,
      },
      {
        title: 'גבייה חודשית שנבנית לבד',
        body: 'החשבון של כל תלמיד מורכב משיעורים, מנויים וביטולים. אישור אחד — ובקשת התשלום בדרך.',
        image: 'billing-table' as const,
      },
      {
        title: 'הודעות שנשלחות לבד',
        body: 'תזכורות שיעור, בקשות תשלום, תזכורות שיעורי בית וקבלות — בעברית או באנגלית, בערוץ הרשמי.',
        image: 'wa-payment-request' as const,
      },
      {
        title: 'שירות עצמי להורים',
        body: 'לו"ז, יתרה, קישורי תשלום, קבלות, שיעורי בית ופורטל — בהודעת וואטסאפ או בקישור אחד, בלי להתקין כלום.',
        image: 'portal-payments' as const,
      },
      {
        title: 'מורים ותפעול',
        body: 'מורים, תלמידים, קבוצות, זמינות, בקשות יום חופש ותיעוד שיעורים — עם הפרדת תפקידים ברורה.',
        image: 'teachers' as const,
      },
      {
        title: 'דוחות שמסתכלים קדימה',
        body: 'הכנסות, חובות, אחוזי ביטולים ותחזית. רואים לאן העסק הולך, לא רק איפה הוא היה.',
        image: 'reports-revenue' as const,
      },
    ],
  },
  israel: {
    title: 'בנויה לאיך שעסק הוראה עובד בישראל',
    items: [
      'Bit, PayBox, Cardcom, PayPlus, Stripe ו-Grow',
      'קבלות דרך ספקים ישראליים מורשים',
      'בוט שעונה בעברית ובאנגלית',
      'חגי ישראל נטענים לבד ליומן',
      'מדיניות ביטולים של עולם השיעורים — לא של חנות',
    ],
  },
  trust: {
    title: 'אוטומציה עם חגורת בטיחות',
    items: [
      {
        title: 'הערוץ הרשמי של Meta',
        body: 'WhatsApp Business Platform עם מספר עסקי משלכם ותבניות מאושרות. בלי אוטומציות לא-רשמיות, בלי דפדפן פתוח, בלי סיכון למספר.',
      },
      {
        title: 'עניתם בעצמכם — הבוט שותק',
        body: 'עניתם להורה ידנית מהמערכת? הבוט יוצא מהשיחה לשש שעות. בלי תשובות כפולות.',
      },
      {
        title: 'שום דבר לא קורה בלי אישור',
        body: 'ההורה מאשר לפני ביטול. אתם מאשרים לפני שחיוב נשלח. ה-AI מציע — אף פעם לא מבצע לבד.',
      },
      {
        title: 'ההורים נשארים בשליטה',
        body: 'הודעת "הסר" אחת עוצרת הכול. נתונים נמחקים לפי מדיניות שמירה מוגדרת.',
      },
    ],
  },
  audience: {
    title: 'Lessio לא נבנתה לכל מורה. היא נבנתה לעסק.',
    subtitle:
      'לרגע שבו ההוראה כבר הפכה לעסק — עשרות תלמידים, כמה מורים, וגבייה שאי אפשר להחזיק בראש.',
    forTitle: 'מתאים',
    forBullets: [
      'מורה פרטי עם עומס תפעולי אמיתי',
      'מרכז עם כמה מורים או כמה חדרים',
      'עסק שגדל וצריך תשתית שתעמוד בקצב',
      'מי שרוצה גבייה מסודרת בלי לרדוף בעצמו',
    ] as const,
    notForTitle: 'פחות מתאים',
    notForBullets: [
      'מעט תלמידים והתפעול עדיין פשוט',
      'צריך רק יומן בסיסי',
      'לא מחפש לשנות את הדרך שבה העסק עובד',
    ] as const,
    closing:
      'לא כל עסק צריך מערכת כזו. אבל עסק שכבר רץ — לא אמור להמשיך להחזיק את עצמו ידנית.',
  },
  pricing: {
    title: 'מחיר אחד לעסק, לפי מספר המורים',
    intro:
      'בכל המסלולים יש וואטסאפ, גבייה, קבלות, פורטל הורים ושיעורי בית. מה שמשתנה הוא כמה מורים העסק מריץ.',
    monthlyLabel: 'חודשי',
    yearlyLabel: 'שנתי',
    perMonth: '/ לחודש',
    perYear: '/ לשנה',
    yearlyNote: 'תשלום שנתי — חודשיים מתנה.',
    // ראה PRICES_INCLUDE_VAT ב-src/lib/saas/pricing.ts — עוסק פטור, ולכן
    // המחיר המוצג הוא המחיר הנגבה. השניים משתנים יחד ביום המעבר לעוסק מורשה.
    vatNote: 'המחירים סופיים — ללא מע"מ.',
    teachersOne: 'מורה אחד',
    teachersUpTo: 'עד {count} מורים',
    teachersUnlimited: 'מורים ללא הגבלה',
    cta: 'התחילו 30 יום ניסיון',
    trialNote: '30 יום ניסיון. בלי כרטיס אשראי.',
    trialIncludes: 'הניסיון כולל את מסלול סטודיו המלא.',
  },
  faq: {
    title: 'מענה לשאלות נפוצות',
    items: [
      {
        question: 'זה מתאים לכל מי שמלמד?',
        opening: 'לא.',
        rest: [
          'Lessio לא נבנתה לכל מורה. היא נבנתה לעסק.',
          'אם התפעול עדיין פשוט מאוד, כנראה שעוד לא צריך מערכת כזו. אם העסק כבר רץ - זה בדיוק השלב.',
        ],
      },
      {
        question: 'האם זה וואטסאפ רשמי?',
        opening: 'כן.',
        rest: [
          'Lessio רצה על WhatsApp Business Platform של Meta, בחיבור מודרך ועם תבניות הודעה מאושרות. בלי אוטומציות לא-רשמיות, בלי טלפון שצריך להישאר דלוק, בלי סיכון לחסימת המספר.',
        ],
      },
      {
        question: 'האם אני צריכה להחליף מספר?',
        opening: 'מחברים מספר עסקי ייעודי דרך התהליך של Meta.',
        rest: [
          'אפשר גם להעביר מספר קיים לפלטפורמה העסקית, אבל רוב העסקים מעדיפים מספר עסקי נפרד - כך הקו האישי נשאר אישי.',
        ],
      },
      {
        question: 'איך ההורים משתמשים ב-Lessio?',
        opening: 'הם לא מתקינים כלום.',
        rest: [
          'הם כותבים לוואטסאפ של העסק ומקבלים תפריט: ביטול, קביעה, יתרה, קבלות, פורטל. מי שמעדיף - נכנס לפורטל בקישור עם קוד חד-פעמי.',
        ],
      },
      {
        question: 'כמה זמן לוקח לעבור למערכת?',
        opening: 'אפשר לעבוד כבר ביום הראשון.',
        rest: [
          'ההקמה מודרכת, ותלמידים, הורים ושיעורים נכנסים בייבוא מאקסל - לא בהקלדה מחדש. חיבור הוואטסאפ מול Meta הוא הצעד שלוקח הכי הרבה זמן, והמערכת עובדת גם לפניו.',
        ],
      },
      {
        question: 'מה קורה כשהורה מבטל?',
        opening: 'המדיניות שלך מחליטה.',
        rest: [
          'קובעים חלון ביטול ואחוזי חיוב פעם אחת. מאותו רגע כל ביטול מתומחר לבד, ההורה רואה את הסכום לפני שהוא מאשר, והחיוב נכנס לחשבון החודשי.',
        ],
      },
      {
        question: 'אין לי זמן להטמיע עכשיו.',
        opening: 'ברוב המקרים, זאת בדיוק הנקודה.',
        rest: [
          'הטמעה מסודרת לוקחת זמן פעם אחת. כאוס תפעולי לוקח זמן כל שבוע.',
        ],
      },
      {
        question: 'מה קורה אם אני כבר "מסתדר" עם הכלים שיש לי?',
        rest: [
          'אם באמת הכול סגור, ברור, ומתועד - כנראה שלא צריך לשנות.',
          'אבל אם יש עומס, מרדפים, חוסר בהירות ותחושה שהעסק מוחזק ידנית - Lessio נבנתה בדיוק בשביל זה.',
        ],
      },
    ],
  },
  finalCta: {
    title: 'הודעת הביטול הבאה תגיע בכל מקרה.',
    body: 'השאלה היחידה היא כמה עבודה היא תשאיר אחריה.',
    cta: 'התחילו 30 יום ניסיון',
    note: '30 יום ניסיון. בלי כרטיס אשראי. הניסיון כולל את מסלול סטודיו המלא.',
  },
  footer: {
    statusLabel: 'מערכת פעילה',
    domain: 'getlessio.com',
    legalNavLabel: 'מסמכים משפטיים',
    privacy: 'מדיניות פרטיות',
    terms: 'תנאי שימוש',
    dataDeletion: 'מחיקת נתונים',
    addressLabel: 'כתובת',
    supportLabel: 'תמיכה',
  },
  nav: {
    login: 'כניסה',
    signup: 'להתחיל בחינם',
    howItWorks: 'איך זה עובד',
    pricing: 'מחירים',
    faq: 'שאלות',
  },
  meta: {
    title: 'LESSIO — מערכת ההפעלה לעסקי הוראה ומרכזי למידה',
    description:
      'הוואטסאפ של ההורים מחובר לעסק: ביטול מתומחר לפי המדיניות שלך, נכנס לחיוב החודשי ומתעדכן ביומן — לבד. 30 יום ניסיון בלי כרטיס אשראי.',
  },
} as const

export type LandingContent = (typeof landingEnCore | typeof landingHeCore) & {
  links: {
    login: string
    signup: string
    howItWorks: string
  }
}

export function getLandingContent(locale: string): LandingContent {
  const core = locale === 'en' ? landingEnCore : landingHeCore

  return {
    ...core,
    links: {
      login: '/login',
      signup: '/signup',
      howItWorks: '#how-it-works',
    },
  }
}

export function getLandingMetadata(locale: string): {
  title: string
  description: string
  openGraph: {
    title: string
    description: string
    locale: string
    type: 'website'
  }
  twitter: {
    card: 'summary_large_image'
    title: string
    description: string
  }
} {
  const c = getLandingContent(locale)
  const { title, description } = c.meta

  return {
    title,
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      locale: locale === 'en' ? 'en_US' : 'he_IL',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}
