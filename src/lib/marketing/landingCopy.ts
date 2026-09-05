/** Landing copy — short, sharp Hebrew + English parallel. */

const landingEnCore = {
  hero: {
    headline: 'Operational chaos costs money. Lessio stops the leak.',
    subheadline: 'Business infrastructure for private tutors and learning centers',
    supporting: [] as const,
    highlights: ['One system', 'WhatsApp', 'Auto billing'] as const,
    ctaPrimary: 'Sign up',
    ctaLogin: 'Sign in',
  },
  problem: {
    title: 'What does it look like without our infrastructure?',
    processSteps: [
      'Last-minute cancellations hit WhatsApp and vanish inside a long thread.',
      'Charges that should go out simply get forgotten in the noise.',
      'Parents do not get updates on time — then come messages, questions, and frustration.',
      'The spreadsheet exists, but nobody is really sure which version is right.',
      'Information sits in several places at once, with no single source of truth to trust.',
      'Every small change needs manual tracking, memory, and coordination across channels.',
      'Meanwhile, every day, money, time, and focus keep leaking out.',
    ] as const,
  },
  currentState: {
    title: "The problem isn't the load. The problem is there's no system holding it together.",
    items: [
      {
        title: 'Charges that never close on time',
        body: 'The lesson ends, the day keeps going, and the charge that should have gone out stays stuck in memory.',
      },
      {
        title: 'Last-minute cancellations turn into a big problem',
        body: 'The schedule breaks, the slot is wasted, and the revenue you were supposed to see, simply vanishes.',
      },
      {
        title: 'No single source you can trust',
        body: 'Information is scattered across WhatsApp, spreadsheets, and your head — and nobody is sure what is actually true.',
      },
      {
        title: 'Scheduling lives only in endless WhatsApp threads',
        body: "One update gets missed, one parent doesn't get an answer, and the phone won't stop ringing.",
      },
    ],
  },
  solution: {
    title: 'Why Lessio',
    intro:
      'Because a tutoring business does not need another tool. It needs a system that connects the whole day-to-day into one place.',
    pillars: [
      {
        title: 'Built around what actually happens in the business',
        body: 'Not just scheduling — also cancellations, billing, communication, and follow-through.',
      },
      {
        title: 'Parents stay on WhatsApp',
        body: 'No new app, no retraining, and no unnecessary friction.',
      },
      {
        title: 'Less scatter, more control',
        body: 'When the day-to-day lives in one place, fewer things fall through the cracks.',
      },
    ],
  },
  businessValue: {
    title: 'What does not close in the system is lost in the day-to-day.',
    paragraphs: [
      'Unbilled cancellations, delayed payments, lessons not logged on time — these are not rare exceptions. They are where money slips when too much relies on memory, messages, and manual tracking.',
      'Lessio centralizes the operational flow in one clear system, so fewer things stay open — and less revenue is lost along the way.',
    ],
    stats: ['Parents stay on WhatsApp', 'All day-to-day in one place', 'Fewer leaks, more control'] as const,
  },
  audience: {
    title: 'Lessio was not built for every tutor. It was built for a business.',
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
        question: 'Do parents need to switch to a new app?',
        opening: 'No.',
        rest: [
          'Communication stays on WhatsApp. Less friction, fewer explanations, less chance of losing a reply along the way.',
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
        question: 'What does Lessio actually replace?',
        opening: 'It replaces scatter.',
        rest: [
          'Instead of WhatsApp, spreadsheets, reminders, and memory - one system that holds the day-to-day.',
        ],
      },
      {
        question: 'Where is the economic value?',
        rest: [
          'Right where money leaks: cancellations, billing, coordination, and follow-up.',
          'Lessio helps close the day-to-day more clearly, so fewer things stay open.',
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
    signup: 'Sign up',
  },
} as const

const landingHeCore = {
  hero: {
    headline: 'הכאוס התפעולי עולה כסף. Lessio שמה לזה סוף.',
    subheadline: 'תשתית עסקית למורים פרטיים ומרכזי למידה',
    supporting: [] as const,
    highlights: ['מערכת אחת', 'WhatsApp', 'גבייה אוטומטית'] as const,
    ctaPrimary: 'הרשמה',
    ctaLogin: 'כניסה',
  },
  problem: {
    title: 'איך זה נראה בלי התשתית שלנו?',
    processSteps: [
      'ביטולים ברגע האחרון מגיעים ב-WhatsApp ונבלעים בתוך שרשור שלם.',
      'חיובים שאמורים לצאת פשוט נשכחים בתוך העומס.',
      'הורים לא מקבלים עדכון בזמן, ואז מתחילות הודעות, שאלות ותסכול.',
      'האקסל קיים, אבל אף אחד לא באמת בטוח איזו גרסה היא הנכונה.',
      'מידע יושב בכמה מקומות במקביל, בלי מקור אחד ברור שאפשר לסמוך עליו.',
      'כל שינוי קטן דורש מעקב ידני, זיכרון, ותיאום בין כמה ערוצים.',
      'ובינתיים, בכל יום, כסף, זמן וריכוז ממשיכים לדלוף.',
    ] as const,
  },
  currentState: {
    title: 'הבעיה היא לא העומס. הבעיה היא שאין מערכת שמחזיקה אותו.',
    items: [
      {
        title: 'חיובים שלא נסגרים בזמן',
        body: 'שיעור נגמר, היום ממשיך, והחיוב שאמור היה לצאת נשאר תלוי בזיכרון.',
      },
      {
        title: 'ביטולים של הרגע האחרון הופכים לבעיה גדולה',
        body: 'הלו״ז נפגע, המקום מתבזבז, וההכנסה שהיית אמורה לראות, פשוט נעלמת.',
      },
      {
        title: 'אין מקור אחד שאפשר לסמוך עליו',
        body: 'המידע מפוזר בין WhatsApp, אקסל והראש שלך — ובסוף אף אחד לא בטוח מה נכון.',
      },
      {
        title: 'התיאום מתועד רק בהתכתבויות אינסופיות ב-WhatsApp',
        body: 'עדכון אחד מתפספס, הורה אחד לא מקבל תשובה, והטלפון לא מפסיק לצלצל.',
      },
    ],
  },
  solution: {
    title: 'למה דווקא Lessio',
    intro:
      'כי עסק שיעורים לא צריך עוד כלי. הוא צריך מערכת שמחברת את כל השוטף למקום אחד.',
    pillars: [
      {
        title: 'נבנתה סביב מה שבאמת קורה בעסק',
        body: 'לא רק תיאום, אלא גם ביטולים, גבייה, תקשורת ומעקב.',
      },
      {
        title: 'ההורים נשארים ב-WhatsApp',
        body: 'בלי אפליקציה חדשה, בלי חינוך מחדש, בלי חיכוך מיותר.',
      },
      {
        title: 'פחות פיזור, יותר שליטה',
        body: 'כשהשוטף מרוכז במקום אחד, פחות דברים נופלים בדרך.',
      },
    ],
  },
  businessValue: {
    title: 'מה שלא נסגר במערכת, הולך לאיבוד בשוטף.',
    paragraphs: [
      'ביטולים שלא חויבו, תשלומים שנדחו, שיעורים שלא תועדו בזמן — אלה לא מקרים נדירים. אלה המקומות שבהם עסק מאבד כסף כשיותר מדי דברים נשענים על זיכרון, הודעות ומעקב ידני.',
      'Lessio מרכזת את השוטף במערכת אחת ברורה, כדי שפחות דברים יישארו פתוחים — ופחות כסף ילך לאיבוד בדרך.',
    ],
    stats: ['ההורים נשארים ב-WhatsApp', 'כל השוטף במקום אחד', 'פחות דליפות, יותר שליטה'] as const,
  },
  audience: {
    title: 'Lessio לא נבנתה לכל מורה. היא נבנתה לעסק.',
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
    cta: '30 יום ניסיון',
    trialNote: '30 יום ניסיון. בלי כרטיס אשראי.',
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
        question: 'ההורים צריכים לעבור לאפליקציה חדשה?',
        opening: 'לא.',
        rest: [
          'התקשורת נשארת ב-WhatsApp. פחות חיכוך, פחות הסברים, פחות סיכוי לאבד תגובה בדרך.',
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
        question: 'מה Lessio מחליפה בפועל?',
        opening: 'היא מחליפה פיזור.',
        rest: [
          'במקום WhatsApp, אקסל, תזכורות וזיכרון - מערכת אחת שמחזיקה את השוטף.',
        ],
      },
      {
        question: 'איפה הערך הכלכלי?',
        rest: [
          'בדיוק במקומות שבהם כסף נוזל: ביטולים, גבייה, תיאום ומעקב.',
          'Lessio עוזרת לסגור את השוטף בצורה ברורה יותר, כדי שפחות דברים יישארו פתוחים.',
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
    signup: 'הרשמה',
  },
} as const

export type LandingContent = (typeof landingEnCore | typeof landingHeCore) & {
  links: {
    login: string
    signup: string
  }
}

export function getLandingContent(locale: string): LandingContent {
  const core = locale === 'en' ? landingEnCore : landingHeCore

  return {
    ...core,
    links: {
      login: '/login',
      signup: '/signup',
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
  const title = `LESSIO — ${c.hero.subheadline}`
  const description = c.hero.headline

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
