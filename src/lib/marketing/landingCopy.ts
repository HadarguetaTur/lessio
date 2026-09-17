/**
 * Landing copy — short, sharp Hebrew + English parallel.
 *
 * House style (also used by docs/video-brand-script.md): short sentences,
 * no exclamation points, no promises the code can't keep. The page tells one
 * story — a parent's WhatsApp message becoming a priced charge, a freed slot
 * and a line on the monthly bill — and everything else hangs off that rail.
 * English is written natively, not translated sentence-by-sentence.
 *
 * The page is set as a teacher's paper week diary (see the surface brief under
 * .impeccable/surfaces/): the hero is a week spread, and the diary block below
 * carries the demonstration week around the worked example. There is no
 * eyebrow above the headline by design; "forLine" is a pen note under the CTA.
 *
 * Every product claim here is backed by shipped behavior. Things that are NOT
 * claimable (and must stay out): free-text NLU ("Noa won't come tomorrow" is
 * not parsed — the flow is button/menu driven), WhatsApp rescheduling (demo
 * flag only), Google Calendar two-way sync (read-only conflict detection),
 * a broad "AI secretary" (the copilot classifies and always requires a
 * confirm tap), "only we have official WhatsApp" or any claim about
 * competitors, testimonials/metrics (none exist yet).
 */

/** The 75-second demo, linked (never embedded) from the landing page and the demo email. */
export const DEMO_VIDEO_URL = 'https://youtu.be/LrdokOpDhF0'

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

/** One entry on the hero week spread; the story entry is the one the pen strikes. */
export type LandingDiaryEntry = { day: number; hour: number; text: string; story?: boolean }

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
    forLine: '',
    headline: {
      less: 'Why does every WhatsApp message from a parent',
      lessRest: ' become another task for you?',
      more: '',
      moreRest: '',
    },
    subheadline:
      'A cancellation, a booking, a question about a payment. Each one ends up on your desk: the calendar, the spreadsheet, a note to yourself. Lessio connects WhatsApp to the calendar, lessons and billing, so what was settled in the conversation is already updated in the business.',
    ctaPrimary: 'Try Lessio free',
    ctaSecondary: 'See how it works',
    /** Rendered under the primary action. */
    trustLine: "30 days free, no credit card, on Meta's official WhatsApp.",
    outcomes: ['The parent confirms', 'The charge is recorded', 'The calendar updates'],
    diary: {
      weekLabel: 'Week of 30 Aug – 3 Sep',
      days: [
        { name: 'Sun', date: '30/08' },
        { name: 'Mon', date: '31/08' },
        { name: 'Tue', date: '01/09' },
        { name: 'Wed', date: '02/09' },
        { name: 'Thu', date: '03/09' },
      ],
      /** Demonstration entries, all fictional; the Monday 14:00 one is the story. */
      entries: [
        { day: 0, hour: 16, text: 'Yuval Cohen · guitar' },
        { day: 1, hour: 14, text: 'Noa Levi · piano', story: true },
        { day: 2, hour: 17, text: 'Maths group' },
        { day: 3, hour: 15, text: 'Dana · piano' },
        { day: 3, hour: 19, text: 'Ori · drums' },
      ] as readonly LandingDiaryEntry[],
      marginNote: 'Cancelled 21:40 · ₪60',
      freedNote: 'Slot open again',
      synthetic: 'Illustrative week. Noa Levi is the worked example used across this page.',
    },
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
      line: 'Cancellation charge: Noa Levi',
      amount: '₪60',
      slot: 'The 14:00 slot is open again on the calendar',
    },
  },
  chain: {
    title: 'How Lessio handles the everyday work while you teach',
    intro: 'A cancellation is the simple example. This is how one WhatsApp message travels through the calendar, the charge, the monthly bill and the payment.',
    cta: 'Try Lessio free',
    videoLink: 'See it in 75 seconds',
    beats: [
      {
        title: 'The parent cancels on WhatsApp',
        body: 'Tap "cancel", pick the lesson, confirm. No new app, no phone calls, no waiting for the morning.',
        image: 'wa-cancel-flow' as const,
      },
      {
        title: 'Your policy prices it',
        body: 'Set the rules once. For example, a full charge inside 24 hours and 50% inside two. The system does the math, and the parent sees the amount before confirming.',
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
        body: 'Each student’s bill builds itself from lessons, subscriptions and cancellations. You approve once, and the payment request goes out to every parent on WhatsApp.',
        image: 'billing-detail' as const,
      },
      {
        title: 'The parent pays. You stop chasing.',
        body: 'The payment request carries a checkout link. The parent pays, the charge is marked paid, and the receipt is issued on its own and kept in the parent portal. Anyone who has not paid gets a reminder.',
        // Rendered as the paymentChat printout below, not a screenshot: the
        // wa-payment-request capture still carries raw {{placeholders}}.
        image: null,
      },
    ],
    /** Beat 6. Mirrors the payment_request and receipt_notification templates, with the worked example's numbers. */
    paymentChat: {
      messages: [
        {
          from: 'business',
          lines: [
            'Hi Ronit 👋',
            'Here is a payment request for ₪540, for Noa’s August bill.',
            '• Piano lessons 4 × ₪120: ₪480',
            '• Cancellation 31/08: ₪60',
            'Paying is secure and takes under a minute.',
            'Thank you 🙏',
          ],
          time: '09:12',
          buttons: ['Pay securely'],
        },
        {
          from: 'business',
          lines: ['Thank you for your payment! 🙏', 'Your receipt for ₪540 is here'],
          time: '09:26',
          highlight: true,
        },
      ] as readonly LandingChatMessage[],
    },
    policyCard: {
      title: 'Cancellation policy',
      rules: ['Up to 24 hours: full charge', 'Up to 2 hours: 50%'],
      result: 'Partial cancellation charge: ₪60',
    },
    ledger: {
      title: 'Noa Levi · August bill',
      rows: [
        ['Piano lessons · 4 × ₪120', '₪480'],
        ['Cancellation 31/08 14:00', '₪60'],
      ],
      total: ['Total', '₪540'],
      approved: 'Approved. Payment request sent on WhatsApp.',
    },
  },
  problem: {
    title: 'Without a system, all of it stays with you.',
    items: [
      {
        title: 'The charge never goes out',
        body: 'The lesson is cancelled, nobody is billed, and the revenue simply disappears.',
      },
      {
        title: 'The slot stays empty',
        body: 'You find out about the cancellation tomorrow, when it is too late to fill it.',
      },
      {
        title: 'There is no single version of the truth',
        body: 'WhatsApp, the spreadsheet and your memory tell three different stories.',
      },
    ],
    closing: 'What does not close in the system is lost in the day-to-day.',
  },
  capabilities: {
    title: 'The calendar, the money and the parents. In one place.',
    intro:
      'Every lesson, payment and message is recorded on the same student, so whoever opens the system sees what happened without asking anyone.',
    items: [
      {
        title: 'The calendar',
        body: 'Lessons, availability, cancellations and make-up sessions, tied to the right teacher and student. Every teacher sees their own day.',
        image: 'calendar-week' as const,
      },
      {
        title: 'The money',
        body: 'Charges build from activity. The parent pays through a link, the charge is marked paid, and the receipt goes out on its own. Whatever is still open stays in view until it closes.',
        image: 'billing-table' as const,
      },
      {
        title: 'The parents',
        body: 'Reminders, payment requests, homework and receipts arrive on WhatsApp, and the parent portal shows all of it. Nothing to install.',
        image: 'portal-payments' as const,
      },
    ],
  },
  implementation: {
    title: 'You do not replace the way you work in a day. You start with what already works.',
    intro: 'Move over gradually. Lessio works before WhatsApp is connected, so the longest setup step does not hold up the rest.',
    steps: [
      ['Bring in the foundation', 'Import students, parents and lessons from a spreadsheet instead of retyping them.'],
      ['Set the rules', 'Teachers, availability, cancellation policy, payment provider and receipts. Once.'],
      ['Turn it on gradually', 'Start with the calendar and billing. Connect WhatsApp when you are ready.'],
    ],
  },
  israel: {
    title: 'Built for how tutoring businesses work in Israel',
    items: [
      'Payments through Bit, PayBox, Cardcom, PayPlus, Stripe or Grow',
      'Receipts through Green Invoice, iCount or Sumit',
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
        title: 'When you reply, the bot goes quiet',
        body: 'Answered a parent yourself from the dashboard? The bot steps out of that conversation for six hours. No double replies.',
      },
      {
        title: 'Nothing happens without a confirmation',
        body: 'The parent confirms before a cancellation. You approve before a charge is sent. AI suggests, it never acts on its own.',
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
      'For the moment teaching has become a business: dozens of students, several teachers, and billing you can no longer keep in your head.',
    forTitle: 'Good fit',
    forBullets: [
      '2 to 5 teachers and monthly billing',
      'Parents who pay by Bit, bank transfer and cash, and a month that has to close every time',
      'A business that is growing, and a spreadsheet that no longer holds it',
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
      'Every plan includes everything: WhatsApp, payments, receipts, the parent portal and homework. The only difference is the number of teachers.',
    monthlyLabel: 'Monthly',
    yearlyLabel: 'Yearly',
    perMonth: '/ month',
    perYear: '/ year',
    yearlyNote: 'Yearly billing is two months free.',
    // Paired with PRICES_INCLUDE_VAT in src/lib/saas/pricing.ts — the company
    // is VAT-exempt, so the price shown is the price charged. Both change on
    // the day it registers for VAT.
    vatNote: 'Prices are final. No VAT is added.',
    teachersOne: '1 teacher',
    teachersUpTo: 'Up to {count} teachers',
    teachersUnlimited: 'Unlimited teachers',
    featuredLabel: '2 to 5 teachers',
    featureLine: 'All features included',
    cta: 'Try Lessio free',
    trialNote: '30 days with every feature unlocked. No credit card.',
    trialIncludes: 'The trial includes the full Studio plan.',
    customPricing: 'Custom pricing',
    centerInquiry: {
      cta: 'Talk to us',
      title: 'A Center plan built for you',
      body: 'Leave your details and we will help tailor the right plan.',
      name: 'Full name',
      phone: 'Phone',
      submit: 'Send details',
      success: 'Thanks, we will be in touch shortly.',
      error: 'We could not save your details. Please try again.',
    },
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
        question: 'How do parents pay?',
        opening: 'Through a link, from WhatsApp.',
        rest: [
          'The payment request carries a link to your payment provider. After payment the charge is marked paid, the receipt is issued through your receipt provider and kept in the parent portal. Cash and bank transfers are marked by hand, and the receipt goes out the same way.',
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
  /**
   * The cover beside the login / signup note. The visitor has already decided,
   * so this does not re-ask the hero's question: it shows the morning after.
   */
  authCover: {
    headline: ['The calendar is up to date.', 'The bills are closed.', 'No message is waiting for you.'],
    body: 'A parent cancelled last night, and the slot is already open. A parent paid, and the receipt is already with them. You come in and see only what actually needs you.',
    mobileLine: 'The calendar is up to date. The bills are closed.',
    morning: {
      title: 'This morning, 08:00',
      rows: [
        ['Noa cancelled last night at 21:40', 'Charged ₪60'],
        ['The 14:00 slot', 'Open on the calendar'],
        ['Noa’s August bill', 'Paid'],
        ['Receipt', 'Sent to the parent'],
      ],
      note: 'And you did not touch a thing.',
    },
  },
  finalCta: {
    title: 'The business already runs. Now let the system run with it.',
    body: 'Start with one cancellation or one month of billing, and see what is left of the load.',
    cta: 'Try Lessio free',
    note: "30 days free, no credit card, on Meta's official WhatsApp.",
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
    /** The diary's thumb index: one tab per page, in page order. */
    tabs: {
      week: 'This week',
      chain: 'One message',
      problem: 'Without a system',
      centre: 'Day to day',
      rollout: 'Rollout',
      trust: 'Trust',
      audience: 'Who it is for',
      pricing: 'Plans',
      faq: 'Questions',
    },
  },
  meta: {
    title: 'LESSIO | WhatsApp, calendar and billing in one place',
    description:
      'For tutoring businesses with several teachers. What is settled with the parent on WhatsApp is updated in the calendar and the monthly bill, the parent pays through a link and the receipt goes out on its own. 30 days free, no credit card.',
  },
} as const

const landingHeCore = {
  hero: {
    forLine: '',
    headline: {
      less: 'למה כל הודעה מהורה בוואטסאפ',
      lessRest: ' הופכת לעוד משימה שלכם?',
      more: '',
      moreRest: '',
    },
    subheadline:
      'ביטול, קביעת שיעור, שאלה על תשלום. כל אחת מהן נגמרת אצלכם ביומן, בטבלה ובתזכורת לעצמכם. Lessio מחברת את הוואטסאפ ליומן, לשיעורים ולגבייה, ומה שנסגר בשיחה כבר מעודכן בעסק.',
    ctaPrimary: 'נסו את Lessio בחינם',
    ctaSecondary: 'איך זה עובד',
    /** Rendered under the primary action. */
    trustLine: '30 יום בחינם, בלי כרטיס אשראי, על הוואטסאפ הרשמי של Meta.',
    outcomes: ['ההורה מאשר', 'החיוב נרשם', 'היומן מתעדכן'],
    diary: {
      weekLabel: 'שבוע 30.08 – 03.09',
      days: [
        { name: 'א׳', date: '30/08' },
        { name: 'ב׳', date: '31/08' },
        { name: 'ג׳', date: '01/09' },
        { name: 'ד׳', date: '02/09' },
        { name: 'ה׳', date: '03/09' },
      ],
      /** רשומות הדגמה, כולן בדויות; הרשומה של יום ב׳ 14:00 היא הסיפור. */
      entries: [
        { day: 0, hour: 16, text: 'יובל כהן · גיטרה' },
        { day: 1, hour: 14, text: 'נועה לוי · פסנתר', story: true },
        { day: 2, hour: 17, text: 'קבוצת מתמטיקה' },
        { day: 3, hour: 15, text: 'דנה · פסנתר' },
        { day: 3, hour: 19, text: 'אורי · תופים' },
      ] as readonly LandingDiaryEntry[],
      marginNote: 'ביטול 21:40 · ₪60',
      freedNote: 'המשבצת התפנתה',
      synthetic: 'שבוע להמחשה. נועה לוי היא הדוגמה שמלווה את כל הדף.',
    },
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
      line: 'חיוב ביטול: נועה לוי',
      amount: '₪60',
      slot: 'המשבצת של 14:00 התפנתה ביומן',
    },
  },
  chain: {
    title: 'ככה Lessio מטפלת בשוטף בזמן שאתם מלמדים',
    intro: 'ביטול הוא הדוגמה הפשוטה. ככה הודעה אחת בוואטסאפ עוברת דרך היומן, החיוב, החשבון החודשי והתשלום.',
    cta: 'נסו את Lessio בחינם',
    videoLink: 'לראות את זה ב-75 שניות',
    beats: [
      {
        title: 'ההורה מבטל בוואטסאפ',
        body: 'לחיצה על "ביטול שיעור", בחירת שיעור, אישור. בלי אפליקציה חדשה, בלי טלפונים, בלי לחכות לבוקר.',
        image: 'wa-cancel-flow' as const,
      },
      {
        title: 'המדיניות שלך מתמחרת',
        body: 'קובעים את הכללים פעם אחת. למשל, חיוב מלא עד 24 שעות ו-50% עד שעתיים. המערכת מחשבת לבד, וההורה רואה את הסכום עוד לפני שהוא מאשר.',
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
        title: 'בסוף החודש הכול כבר שם',
        body: 'החשבון של כל תלמיד נבנה לבד משיעורים, מנויים וביטולים. מאשרים פעם אחת, ובקשת התשלום יוצאת לכל ההורים בוואטסאפ.',
        image: 'billing-detail' as const,
      },
      {
        title: 'ההורה משלם, ואתם לא רודפים',
        body: 'בקשת התשלום מגיעה עם קישור לסליקה. ההורה משלם, החיוב מסומן כשולם, והקבלה יוצאת לבד ונשמרת בפורטל ההורים. מי שלא שילם מקבל תזכורת.',
        // Rendered as the paymentChat printout below, not a screenshot: the
        // wa-payment-request capture still carries raw {{placeholders}}.
        image: null,
      },
    ],
    /** Beat 6. Mirrors the payment_request and receipt_notification templates, with the worked example's numbers. */
    paymentChat: {
      messages: [
        {
          from: 'business',
          lines: [
            'היי רונית 👋',
            'בקשת תשלום על סך 540₪ עבור חשבון אוגוסט של נועה.',
            '• 4 שיעורי פסנתר: 480₪',
            '• ביטול 31/08: 60₪',
            'התשלום מאובטח ולוקח פחות מדקה.',
            'תודה 🙏',
          ],
          time: '09:12',
          buttons: ['לתשלום מאובטח'],
        },
        {
          from: 'business',
          lines: ['תודה על התשלום! 🙏', 'הקבלה על 540₪ זמינה כאן'],
          time: '09:26',
          highlight: true,
        },
      ] as readonly LandingChatMessage[],
    },
    policyCard: {
      title: 'מדיניות ביטולים',
      rules: ['עד 24 שעות: חיוב מלא', 'עד שעתיים: 50%'],
      result: 'חיוב ביטול חלקי: 60₪',
    },
    ledger: {
      title: 'נועה לוי · חשבון אוגוסט',
      rows: [
        ['שיעורי פסנתר · 4 × ₪120', '₪480'],
        ['ביטול 31/08 14:00', '₪60'],
      ],
      total: ['סה״כ', '₪540'],
      approved: 'אושר. בקשת התשלום נשלחה בוואטסאפ.',
    },
  },
  problem: {
    title: 'ובלי מערכת, כל זה נשאר אצלכם.',
    items: [
      {
        title: 'החיוב לא יוצא',
        body: 'השיעור בוטל, אף אחד לא חויב, וההכנסה פשוט נעלמת.',
      },
      {
        title: 'המשבצת נשארת ריקה',
        body: 'על הביטול מגלים מחר, כשכבר מאוחר מדי למלא אותה.',
      },
      {
        title: 'אין גרסה אחת של האמת',
        body: 'הוואטסאפ, האקסל והזיכרון מספרים שלושה סיפורים שונים.',
      },
    ],
    closing: 'מה שלא נסגר במערכת, הולך לאיבוד בשוטף.',
  },
  capabilities: {
    title: 'היומן, הכסף וההורים. באותו מקום.',
    intro:
      'כל שיעור, תשלום והודעה נרשמים על אותו תלמיד, אז מי שפותח את המערכת רואה מה קרה בלי לשאול אף אחד.',
    items: [
      {
        title: 'היומן',
        body: 'שיעורים, זמינות, ביטולים והשלמות, מחוברים למורה ולתלמיד הנכונים. כל מורה רואה את היום שלו.',
        image: 'calendar-week' as const,
      },
      {
        title: 'הכסף',
        body: 'החיובים נבנים מהפעילות. ההורה משלם בקישור, החיוב מסומן כשולם, והקבלה יוצאת לבד. מה שעוד פתוח נשאר מול העיניים עד שנסגר.',
        image: 'billing-table' as const,
      },
      {
        title: 'ההורים',
        body: 'תזכורות, בקשות תשלום, שיעורי בית וקבלות מגיעים בוואטסאפ, ובפורטל ההורים רואים הכול. בלי להתקין כלום.',
        image: 'portal-payments' as const,
      },
    ],
  },
  implementation: {
    title: 'לא מחליפים שיטה ביום אחד. מתחילים ממה שכבר עובד.',
    intro: 'עוברים בהדרגה. Lessio עובדת גם לפני שהוואטסאפ מחובר, אז השלב הארוך בהקמה לא עוצר את השאר.',
    steps: [
      ['מייבאים את הבסיס', 'תלמידים, הורים ושיעורים נכנסים מאקסל, לא בהקלדה מחדש.'],
      ['מגדירים את הכללים', 'מורים, זמינות, מדיניות ביטולים, ספק סליקה וקבלות. פעם אחת.'],
      ['מפעילים בהדרגה', 'מתחילים ביומן ובחיובים. מחברים וואטסאפ כשמוכנים.'],
    ],
  },
  israel: {
    title: 'בנויה לאיך שעסק הוראה עובד בישראל',
    items: [
      'סליקה דרך Bit, PayBox, Cardcom, PayPlus, Stripe או Grow',
      'קבלות דרך חשבונית ירוקה, iCount או Sumit',
      'בוט שעונה בעברית ובאנגלית',
      'חגי ישראל נטענים לבד ליומן',
      'מדיניות ביטולים של עולם השיעורים, לא של חנות',
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
        title: 'עניתם בעצמכם? הבוט שותק',
        body: 'עניתם להורה ידנית מהמערכת? הבוט יוצא מהשיחה לשש שעות. בלי תשובות כפולות.',
      },
      {
        title: 'שום דבר לא קורה בלי אישור',
        body: 'ההורה מאשר לפני ביטול. אתם מאשרים לפני שחיוב נשלח. ה-AI מציע, אף פעם לא מבצע לבד.',
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
      'לרגע שבו ההוראה כבר הפכה לעסק: עשרות תלמידים, כמה מורים וגבייה שאי אפשר להחזיק בראש.',
    forTitle: 'מתאים',
    forBullets: [
      '2 עד 5 מורים וגבייה חודשית',
      'הורים שמשלמים בביט, בהעברה ובמזומן, וצריך לסגור את זה כל חודש',
      'עסק שגדל, והטבלה כבר לא מחזיקה',
      'מי שרוצה גבייה מסודרת בלי לרדוף בעצמו',
    ] as const,
    notForTitle: 'פחות מתאים',
    notForBullets: [
      'מעט תלמידים והתפעול עדיין פשוט',
      'צריך רק יומן בסיסי',
      'לא מחפש לשנות את הדרך שבה העסק עובד',
    ] as const,
    closing:
      'לא כל עסק צריך מערכת כזו. אבל עסק שכבר רץ לא אמור להמשיך להחזיק את עצמו ידנית.',
  },
  pricing: {
    title: 'מחיר אחד לעסק, לפי מספר המורים',
    intro:
      'כל המסלולים כוללים הכול: וואטסאפ, סליקה, קבלות, פורטל הורים ושיעורי בית. ההבדל היחיד הוא מספר המורים.',
    monthlyLabel: 'חודשי',
    yearlyLabel: 'שנתי',
    perMonth: '/ לחודש',
    perYear: '/ לשנה',
    yearlyNote: 'בתשלום שנתי מקבלים חודשיים במתנה.',
    // ראה PRICES_INCLUDE_VAT ב-src/lib/saas/pricing.ts — עוסק פטור, ולכן
    // המחיר המוצג הוא המחיר הנגבה. השניים משתנים יחד ביום המעבר לעוסק מורשה.
    vatNote: 'המחירים סופיים, ללא מע"מ.',
    teachersOne: 'מורה אחד',
    teachersUpTo: 'עד {count} מורים',
    teachersUnlimited: 'מורים ללא הגבלה',
    featuredLabel: '2 עד 5 מורים',
    featureLine: 'כל היכולות כלולות',
    cta: 'נסו את Lessio בחינם',
    trialNote: '30 יום עם כל היכולות פתוחות. בלי כרטיס אשראי.',
    trialIncludes: 'הניסיון כולל את מסלול סטודיו המלא.',
    customPricing: 'מחיר מותאם אישית',
    centerInquiry: {
      cta: 'דברו איתנו',
      title: 'מסלול מרכז בהתאמה אישית',
      body: 'השאירו פרטים ונחזור אליכם להתאמת המסלול.',
      name: 'שם מלא',
      phone: 'טלפון',
      submit: 'שליחת פרטים',
      success: 'קיבלנו, נחזור אליכם בהקדם.',
      error: 'לא הצלחנו לשמור את הפרטים. נסו שוב.',
    },
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
        question: 'איך ההורים משלמים?',
        opening: 'בקישור, מתוך הוואטסאפ.',
        rest: [
          'בקשת התשלום מגיעה עם קישור לספק הסליקה שלכם. אחרי התשלום החיוב מסומן כשולם, הקבלה יוצאת דרך ספק הקבלות ונשמרת בפורטל ההורים. מי שמשלם במזומן או בהעברה, מסמנים ידנית והקבלה יוצאת באותה דרך.',
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
  /**
   * הכריכה שליד פתק הכניסה / ההרשמה. מי שהגיע לכאן כבר החליט, אז לא שואלים
   * שוב את שאלת ה-hero: מראים את הבוקר שאחרי.
   */
  authCover: {
    headline: ['היומן מעודכן.', 'החשבונות סגורים.', 'אף הודעה לא מחכה לכם.'],
    body: 'הורה ביטל בלילה, והמשבצת כבר התפנתה. הורה שילם, והקבלה כבר אצלו. אתם נכנסים בבוקר ורואים רק את מה שבאמת צריך אתכם.',
    mobileLine: 'היומן מעודכן. החשבונות סגורים.',
    morning: {
      title: 'הבוקר, 08:00',
      rows: [
        ['נועה ביטלה אתמול ב-21:40', 'חויב 60₪'],
        ['המשבצת של 14:00', 'פנויה ביומן'],
        ['חשבון אוגוסט של נועה', 'שולם'],
        ['קבלה', 'נשלחה להורה'],
      ],
      note: 'ולא נגעתם בכלום.',
    },
  },
  finalCta: {
    title: 'העסק כבר רץ. עכשיו שהמערכת תרוץ איתו.',
    body: 'התחילו מביטול אחד או מחודש אחד של גבייה, ותראו מה נשאר מהעומס.',
    cta: 'נסו את Lessio בחינם',
    note: '30 יום בחינם, בלי כרטיס אשראי, על הוואטסאפ הרשמי של Meta.',
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
    /** לשוניות היומן: לשונית לכל עמוד, לפי סדר העמודים. */
    tabs: {
      week: 'השבוע',
      chain: 'הודעה אחת',
      problem: 'בלי מערכת',
      centre: 'השוטף',
      rollout: 'הטמעה',
      trust: 'אמון',
      audience: 'למי',
      pricing: 'מסלולים',
      faq: 'שאלות',
    },
  },
  meta: {
    title: 'LESSIO | הוואטסאפ, היומן והגבייה במקום אחד',
    description:
      'לעסקי הוראה עם כמה מורים. מה שנסגר עם ההורה בוואטסאפ מעודכן ביומן ובחשבון החודשי, ההורה משלם בקישור והקבלה יוצאת לבד. 30 יום ניסיון בלי כרטיס אשראי.',
  },
} as const

/**
 * The cores are `as const`, so their strings are literals. Widened here so a
 * second page (src/lib/marketing/tutorsCopy.ts) can reuse the same shape with
 * its own sentences; image keys and chat/diary entries keep their real types.
 */
type Widen<T> = T extends LandingImageKey
  ? LandingImageKey
  : T extends string
    ? string
    : T extends LandingChatMessage | LandingDiaryEntry
      ? T
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T

export type LandingContent = Widen<typeof landingEnCore | typeof landingHeCore> & {
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

export function getLandingMetadata(
  locale: string,
  content: LandingContent = getLandingContent(locale)
): {
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
  const { title, description } = content.meta

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
