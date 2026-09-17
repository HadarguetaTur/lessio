/**
 * Copy for /tutors — the same diary, read by a tutor who works alone.
 *
 * The main landing page says outright that Lessio "was not built for every
 * tutor", so solo traffic (ads, tutor groups, the solo outbound campaign) lands
 * here instead. Only the sentences that assume a team are replaced; the worked
 * example, the chain and the trust page are the landing page's own, and the
 * claim discipline in landingCopy.ts applies unchanged.
 *
 * One thing is said plainly rather than softened: the WhatsApp connection needs
 * a dedicated business number. A solo tutor usually works from a personal
 * number, so this is the question that decides the signup.
 */

import { getLandingContent, type LandingContent, type LandingDiaryEntry } from '@/lib/marketing/landingCopy'

type FaqItem = LandingContent['faq']['items'][number]

/** The question the main page answers with "no" and the number question, rewritten; the rest stand. */
function withTutorFaq(items: LandingContent['faq']['items'], fit: FaqItem, number: FaqItem): LandingContent['faq']['items'] {
  return items.map((item, i) => (i === 0 ? fit : i === 2 ? number : item)) as unknown as LandingContent['faq']['items']
}

function tutorsHe(base: LandingContent): LandingContent {
  return {
    ...base,
    hero: {
      ...base.hero,
      forLine: 'למורים פרטיים עצמאיים',
      headline: {
        less: 'אתם מלמדים.',
        lessRest: '',
        more: 'את הביטולים, התזכורות והגבייה',
        moreRest: ' Lessio סוגרת.',
      },
      subheadline:
        'הורה מבטל ערב לפני, ואתם מתלבטים אם לחייב. מגיע סוף החודש, ואתם משחזרים מהוואטסאפ מי חייב כמה. Lessio מחברת את הוואטסאפ ליומן ולגבייה, ומה שנסגר עם ההורה כבר רשום בחשבון.',
      diary: {
        ...base.hero.diary,
        entries: [
          { day: 0, hour: 16, text: 'יובל כהן · פסנתר' },
          { day: 1, hour: 14, text: 'נועה לוי · פסנתר', story: true },
          { day: 2, hour: 17, text: 'איתי · תיאוריה' },
          { day: 3, hour: 15, text: 'דנה · פסנתר' },
          { day: 3, hour: 19, text: 'אורי · פסנתר' },
        ] as readonly LandingDiaryEntry[],
      },
      chat: { ...base.hero.chat, contactName: 'מיכל · שיעורי פסנתר' },
    },
    problem: {
      ...base.problem,
      items: [
        {
          title: 'מוותרים על החיוב',
          body: 'ביטול של הרגע האחרון, ואף אחד לא רוצה לנהל את השיחה הזאת. אז השיעור פשוט הולך לאיבוד.',
        },
        base.problem.items[1],
        {
          title: 'סוף החודש הוא ערב שלם',
          body: 'הוואטסאפ מצד אחד, היומן מצד שני, והודעה לכל הורה עם הסכום שלו.',
        },
      ],
    },
    capabilities: {
      ...base.capabilities,
      items: [
        {
          ...base.capabilities.items[0],
          body: 'שיעורים, זמינות, ביטולים והשלמות, מחוברים לתלמיד הנכון. הורים קובעים שיעור בקישור, לתוך השעות שפתחתם.',
        },
        base.capabilities.items[1],
        base.capabilities.items[2],
      ],
    },
    audience: {
      ...base.audience,
      title: 'לא לכל מורה. למורה שהיומן שלו כבר מלא.',
      subtitle:
        'לרגע שבו השיעורים הפרטיים הפכו לפרנסה: עשרים תלמידים ומעלה, הורים בוואטסאפ, וגבייה שכבר אי אפשר להחזיק בראש.',
      forBullets: [
        'מורה אחד עם יומן מלא',
        'הורים שמשלמים בביט, בהעברה ובמזומן, וצריך לסגור את זה כל חודש',
        'ביטולים של הרגע האחרון שנגמרים בוויתור',
        'מי שרוצה גבייה מסודרת בלי לרדוף בעצמו',
      ],
      notForBullets: [
        'כמה תלמידים בודדים לצד עבודה אחרת',
        'צריך רק יומן בסיסי',
        'לא רוצה מספר עסקי נפרד לוואטסאפ',
      ],
      closing: 'שיעור מבוטל אחד שמחויב מכסה בערך חודש של Lessio.',
    },
    pricing: {
      ...base.pricing,
      title: 'מחיר אחד, לפי מספר המורים',
      intro:
        'מורה שעובד לבד משלם על מסלול יחיד. הוא כולל הכול: וואטסאפ, סליקה, קבלות, פורטל הורים ושיעורי בית. כשמצטרף מורה נוסף, עוברים לסטודיו.',
      featuredLabel: 'מורה אחד',
    },
    faq: {
      ...base.faq,
      items: withTutorFaq(
        base.faq.items,
        {
          question: 'זה מתאים למורה שעובד לבד?',
          opening: 'כן, אם ההוראה היא הפרנסה.',
          rest: [
            'Lessio שווה את המחיר כשיש יומן מלא, הורים שכותבים בוואטסאפ וגבייה חודשית. עם כמה תלמידים בודדים, יומן רגיל עדיין מספיק.',
          ],
        } as unknown as FaqItem,
        {
          question: 'האם צריך מספר וואטסאפ נוסף?',
          opening: 'כן. Lessio עובדת עם מספר עסקי ייעודי.',
          rest: [
            'זה הוואטסאפ הרשמי של Meta, ומספר שמחובר אליו מפסיק לעבוד באפליקציה הרגילה. רוב המורים לוקחים מספר שני וההורים עוברים אליו, כך שהקו האישי נשאר אישי.',
            'המערכת עובדת גם לפני החיבור: היומן, החיובים והחשבון החודשי זמינים מהיום הראשון.',
          ],
        } as unknown as FaqItem
      ),
    },
    finalCta: {
      ...base.finalCta,
      title: 'היומן כבר מלא. עכשיו שמישהו יסגור את החודש.',
    },
    meta: {
      title: 'LESSIO למורים פרטיים | ביטולים, תזכורות וגבייה בוואטסאפ',
      description:
        'למורים פרטיים עצמאיים. הורה מבטל בוואטסאפ, מדיניות הביטולים שלכם מתמחרת, והחיוב כבר בחשבון של סוף החודש. 30 יום ניסיון בלי כרטיס אשראי.',
    },
  } as LandingContent
}

function tutorsEn(base: LandingContent): LandingContent {
  return {
    ...base,
    hero: {
      ...base.hero,
      forLine: 'For independent private tutors',
      headline: {
        less: 'You teach.',
        lessRest: '',
        more: 'Lessio closes out the cancellations,',
        moreRest: ' the reminders and the billing.',
      },
      subheadline:
        'A parent cancels the night before, and you wonder whether to charge. Month end comes, and you rebuild who owes what from WhatsApp. Lessio connects WhatsApp to the calendar and the billing, so what was settled with the parent is already on the bill.',
      diary: {
        ...base.hero.diary,
        entries: [
          { day: 0, hour: 16, text: 'Yuval Cohen · piano' },
          { day: 1, hour: 14, text: 'Noa Levi · piano', story: true },
          { day: 2, hour: 17, text: 'Itai · theory' },
          { day: 3, hour: 15, text: 'Dana · piano' },
          { day: 3, hour: 19, text: 'Ori · piano' },
        ] as readonly LandingDiaryEntry[],
      },
      chat: { ...base.hero.chat, contactName: 'Michal · piano lessons' },
    },
    problem: {
      ...base.problem,
      items: [
        {
          title: 'You let the charge go',
          body: 'A last-minute cancellation, and nobody wants to have that conversation. So the lesson is simply lost.',
        },
        base.problem.items[1],
        {
          title: 'Month end is a whole evening',
          body: 'WhatsApp on one side, the calendar on the other, and a message to every parent with their amount.',
        },
      ],
    },
    capabilities: {
      ...base.capabilities,
      items: [
        {
          ...base.capabilities.items[0],
          body: 'Lessons, availability, cancellations and make-ups, tied to the right student. Parents book by link, into the hours you opened.',
        },
        base.capabilities.items[1],
        base.capabilities.items[2],
      ],
    },
    audience: {
      ...base.audience,
      title: 'Not for every tutor. For the tutor whose diary is already full.',
      subtitle:
        'For the point where private lessons became a living: twenty students or more, parents on WhatsApp, and billing you can no longer hold in your head.',
      forBullets: [
        'One tutor with a full diary',
        'Parents who pay by Bit, transfer and cash, and it has to be closed every month',
        'Last-minute cancellations that end with you letting it go',
        'Anyone who wants orderly billing without chasing it themselves',
      ],
      notForBullets: [
        'A handful of students alongside another job',
        'Only a basic calendar is needed',
        'No wish for a separate business number for WhatsApp',
      ],
      closing: 'One cancelled lesson that gets charged covers roughly a month of Lessio.',
    },
    pricing: {
      ...base.pricing,
      title: 'One price, by number of teachers',
      intro:
        'A tutor working alone pays for the Solo plan. It includes everything: WhatsApp, payments, receipts, the parent portal and homework. When a second teacher joins, you move to Studio.',
      featuredLabel: 'One teacher',
    },
    faq: {
      ...base.faq,
      items: withTutorFaq(
        base.faq.items,
        {
          question: 'Does it suit a tutor working alone?',
          opening: 'Yes, if teaching is your living.',
          rest: [
            'Lessio earns its price when there is a full diary, parents who write on WhatsApp and monthly billing. With a handful of students, an ordinary calendar is still enough.',
          ],
        } as unknown as FaqItem,
        {
          question: 'Do I need another WhatsApp number?',
          opening: 'Yes. Lessio works with a dedicated business number.',
          rest: [
            "This is Meta's official WhatsApp, and a number connected to it stops working in the regular app. Most tutors take a second number and parents move to it, so the personal line stays personal.",
            'The system works before the connection too: the calendar, the charges and the monthly bill are there from day one.',
          ],
        } as unknown as FaqItem
      ),
    },
    finalCta: {
      ...base.finalCta,
      title: 'The diary is already full. Now let something close the month.',
    },
    meta: {
      title: 'LESSIO for private tutors | Cancellations, reminders and billing on WhatsApp',
      description:
        'For independent private tutors. A parent cancels on WhatsApp, your cancellation policy prices it, and the charge is already on the month-end bill. 30-day trial, no credit card.',
    },
  } as LandingContent
}

export function getTutorsContent(locale: string): LandingContent {
  const base = getLandingContent(locale)
  return locale === 'en' ? tutorsEn(base) : tutorsHe(base)
}
