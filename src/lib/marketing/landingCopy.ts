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
    forLine: 'For tutoring centres with 2 to 5 teachers that bill monthly.',
    headline: {
      less: 'Every cancellation',
      lessRest: ' is priced and collected.',
      more: 'Every month',
      moreRest: ' closes with one approval.',
    },
    subheadline:
      'A parent cancels on WhatsApp. Your policy prices the cancellation and the parent confirms the amount. At month end each student’s bill is already built from lessons, subscriptions and cancellations. You approve, and the payment request goes out.',
    ctaPrimary: 'Try Lessio free',
    ctaPrimaryNote: '30 days with every feature unlocked. No credit card.',
    ctaSecondary: 'See how it works',
    trustLine: "Built on Meta's official WhatsApp Business Platform",
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
    intro: 'A cancellation is only one example. This is what happens when one WhatsApp message needs to update the whole business.',
    cta: 'Try Lessio free',
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
        body: 'Each student’s bill builds itself from lessons, subscriptions and cancellations. You approve, the parent gets a payment request on WhatsApp, the receipt goes out on its own.',
        image: 'billing-detail' as const,
      },
    ],
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
    title: 'Without a system, that same cancellation becomes your job.',
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
    title: 'Three places to run the centre from one system',
    intro:
      'Every lesson, payment and parent message lands in the same record, so the right person can act without rebuilding the story first.',
    items: [
      {
        title: 'Control the day-to-day',
        body: 'Lessons, availability, cancellations and make-up sessions, tied to the right teacher, student and group.',
        image: 'calendar-week' as const,
      },
      {
        title: 'Control the money',
        body: 'Bills build from activity. Open balances stay visible until they close, and payment requests start from one approval.',
        image: 'billing-table' as const,
      },
      {
        title: 'Control parent communication',
        body: 'Reminders, payment requests, homework and the parent portal, through official WhatsApp or one secure link, with nothing to install.',
        image: 'portal-payments' as const,
      },
    ],
  },
  implementation: {
    title: 'You do not replace the way you work in a day. You start with what already works.',
    intro: 'Move the centre in gradually. Lessio works before WhatsApp is connected, so the longest setup step never stops the rest of the business.',
    steps: [
      ['Bring in the foundation', 'Import students, parents and lessons from a spreadsheet instead of retyping them.'],
      ['Set the centre rules', 'Add teachers, availability, cancellation policy and billing settings once.'],
      ['Turn it on gradually', 'Start with your calendar and billing; connect WhatsApp when you are ready.'],
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
      'A centre with 2 to 5 teachers that bills monthly',
      'Several teachers or several rooms under one roof',
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
    vatNote: 'Prices are final. No VAT is added.',
    teachersOne: '1 teacher',
    teachersUpTo: 'Up to {count} teachers',
    teachersUnlimited: 'Unlimited teachers',
    featuredLabel: 'For centres with 2 to 5 teachers',
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
      success: 'Thanks — we will be in touch shortly.',
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
    title: 'Your centre is already working hard. The system should work with it.',
    body: 'Start with one real workflow and see what remains of the operational load when everything is connected.',
    cta: 'Try Lessio free',
    note: '30 days with every feature unlocked. No credit card.',
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
      chain: 'One cancellation',
      problem: 'Without a system',
      centre: 'The centre',
      rollout: 'Rollout',
      trust: 'Trust',
      audience: 'Who it is for',
      pricing: 'Plans',
      faq: 'Questions',
    },
  },
  meta: {
    title: 'LESSIO | Every cancellation priced and collected',
    description:
      'For tutoring centres with 2 to 5 teachers. A parent cancels on WhatsApp, your policy prices it, the charge lands on the monthly bill. 30 days free, no credit card.',
  },
} as const

const landingHeCore = {
  hero: {
    forLine: 'למרכזי למידה עם 2 עד 5 מורים שגובים חודשית.',
    headline: {
      less: 'כל ביטול',
      lessRest: ' מתומחר ונגבה.',
      more: 'כל חודש',
      moreRest: ' נסגר באישור אחד.',
    },
    subheadline:
      'הורה מבטל בוואטסאפ. המדיניות שלכם מתמחרת את הביטול, וההורה מאשר את הסכום. בסוף החודש החשבון של כל תלמיד כבר בנוי משיעורים, מנויים וביטולים. מאשרים, ובקשת התשלום יוצאת.',
    ctaPrimary: 'נסו את Lessio בחינם',
    ctaPrimaryNote: '30 יום עם כל היכולות פתוחות. בלי כרטיס אשראי.',
    ctaSecondary: 'איך זה עובד',
    trustLine: 'מחוברת ל-WhatsApp Business Platform הרשמית של Meta',
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
    intro: 'ביטול הוא רק דוגמה אחת. כך הודעה אחת ב־WhatsApp מעדכנת את כל מה שצריך במרכז.',
    cta: 'נסו את Lessio בחינם',
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
        body: 'החשבון של כל תלמיד נבנה לבד משיעורים, מנויים וביטולים. מאשרים, ההורה מקבל בקשת תשלום בוואטסאפ, והקבלה יוצאת לבד.',
        image: 'billing-detail' as const,
      },
    ],
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
    title: 'ובלי מערכת? אותו ביטול הופך לעוד משימה שלך.',
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
    title: 'שלושה מוקדי שליטה, מערכת אחת למרכז',
    intro:
      'כל שיעור, תשלום והודעה מהורה נרשמים באותו הקשר, כדי שהאדם הנכון יוכל לפעול בלי לבנות מחדש את הסיפור.',
    items: [
      {
        title: 'שליטה בשוטף',
        body: 'שיעורים, זמינות, ביטולים והשלמות מחוברים למורה, לתלמיד ולקבוצה הנכונים.',
        image: 'calendar-week' as const,
      },
      {
        title: 'שליטה בכסף',
        body: 'החיובים נבנים מהפעילות. יתרות פתוחות נשארות מול העיניים עד שהן נסגרות, ובקשת תשלום מתחילה מאישור אחד.',
        image: 'billing-table' as const,
      },
      {
        title: 'שליטה בתקשורת עם הורים',
        body: 'תזכורות, בקשות תשלום, שיעורי בית ופורטל הורים זמינים ב־WhatsApp הרשמי או בקישור מאובטח, בלי להתקין כלום.',
        image: 'portal-payments' as const,
      },
    ],
  },
  implementation: {
    title: 'לא מחליפים שיטה ביום אחד. מתחילים ממה שכבר עובד.',
    intro: 'מעבירים את המרכז בהדרגה. Lessio עובדת גם לפני חיבור WhatsApp, כך ששלב ההגדרה הארוך לא עוצר את שאר העסק.',
    steps: [
      ['מייבאים את הבסיס', 'תלמידים, הורים ושיעורים נכנסים מאקסל, לא בהקלדה מחדש.'],
      ['מגדירים את כללי המרכז', 'מורים, זמינות, מדיניות ביטולים והגדרות גבייה נקבעים פעם אחת.'],
      ['מפעילים בהדרגה', 'מתחילים ביומן ובחיובים; מחברים WhatsApp כשמוכנים.'],
    ],
  },
  israel: {
    title: 'בנויה לאיך שעסק הוראה עובד בישראל',
    items: [
      'Bit, PayBox, Cardcom, PayPlus, Stripe ו-Grow',
      'קבלות דרך ספקים ישראליים מורשים',
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
      'מרכז עם 2 עד 5 מורים וגבייה חודשית',
      'כמה מורים או כמה חדרים תחת קורת גג אחת',
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
      'לא כל עסק צריך מערכת כזו. אבל עסק שכבר רץ לא אמור להמשיך להחזיק את עצמו ידנית.',
  },
  pricing: {
    title: 'מחיר אחד לעסק, לפי מספר המורים',
    intro:
      'בכל המסלולים יש וואטסאפ, גבייה, קבלות, פורטל הורים ושיעורי בית. מה שמשתנה הוא כמה מורים העסק מריץ.',
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
    featuredLabel: 'למרכז עם 2 עד 5 מורים',
    featureLine: 'כל הפיצ׳רים כלולים',
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
    title: 'המרכז שלכם כבר עובד קשה. הגיע הזמן שהמערכת תעבוד איתו.',
    body: 'התחילו בתהליך אמיתי אחד, וראו מה נשאר מהעומס כשהכול מחובר.',
    cta: 'נסו את Lessio בחינם',
    note: '30 יום עם כל היכולות פתוחות. בלי כרטיס אשראי.',
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
      chain: 'ביטול אחד',
      problem: 'בלי מערכת',
      centre: 'המרכז',
      rollout: 'הטמעה',
      trust: 'אמון',
      audience: 'למי',
      pricing: 'מסלולים',
      faq: 'שאלות',
    },
  },
  meta: {
    title: 'LESSIO | כל ביטול מתומחר ונגבה',
    description:
      'למרכזי למידה עם 2 עד 5 מורים. הורה מבטל בוואטסאפ, המדיניות שלכם מתמחרת, והחיוב נכנס לחשבון החודשי. 30 יום ניסיון ללא כרטיס אשראי.',
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
