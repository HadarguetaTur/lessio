/**
 * The localized roster behind scripts/seed-video-demo.ts.
 *
 * Both variants are deliberately ISOMORPHIC: same teacher count, same parent
 * count, same student count, same parent->student mapping, same subjects and
 * levels in the same order. Only the strings differ. That is what lets the
 * capture pipeline shoot he and en with identical row counts and identical card
 * heights, which is what keeps the two video timelines frame-aligned.
 *
 * Change one side and you must change the other in the same position.
 */

export type TeacherSeed = { email: string; name: string; subject: string; rate: number }
export type ParentSeed = { name: string; phone: string; email: string }
export type StudentSeed = {
  name: string
  grade: string
  parent: number
  subject: string
  level: string
}
export type HomeworkSeed = {
  title: string
  body: string
  status: 'overdue' | 'pending' | 'done'
  due: number
}
export type GoalSeed = {
  student: number
  subject: string
  description: string
  status: string
  months: number
}

export type Roster = {
  orgName: string
  orgSlug: string
  ownerName: string
  defaultLocale: 'he' | 'en'
  teachers: TeacherSeed[]
  parents: ParentSeed[]
  students: StudentSeed[]
  homework: HomeworkSeed[]
  notes: string[]
  goals: GoalSeed[]
  feedback: [string, string]
}

const he: Roster = {
  orgName: 'סטודיו מיכל למוזיקה',
  orgSlug: 'studio-michal-video-demo',
  ownerName: 'רונית כהן',
  defaultLocale: 'he',
  teachers: [
    { email: 'michal@demo.getlessio.com', name: 'מיכל אברמוב', subject: 'פסנתר', rate: 240 },
    { email: 'yonatan@demo.getlessio.com', name: 'יונתן שגב', subject: 'גיטרה', rate: 200 },
    { email: 'dana@demo.getlessio.com', name: 'דנה אלמוג', subject: 'כינור', rate: 220 },
  ],
  parents: [
    { name: 'יעל לוי', phone: '+972500000101', email: 'yael.levi@example.com' },
    { name: 'אבי מזרחי', phone: '+972500000102', email: 'avi.mizrahi@example.com' },
    { name: 'שירה פרידמן', phone: '+972500000103', email: 'shira.friedman@example.com' },
    { name: 'תומר גולן', phone: '+972500000104', email: 'tomer.golan@example.com' },
    { name: 'נטלי ברקוביץ', phone: '+972500000105', email: 'natali.b@example.com' },
    { name: 'עומר שרון', phone: '+972500000106', email: 'omer.sharon@example.com' },
    { name: 'הילה נחום', phone: '+972500000107', email: 'hila.nahum@example.com' },
    { name: 'דניאל אשכנזי', phone: '+972500000108', email: 'daniel.a@example.com' },
    { name: 'מאיה רוזן', phone: '+972500000109', email: 'maya.rozen@example.com' },
    { name: 'אלון כרמי', phone: '+972500000110', email: 'alon.carmi@example.com' },
    { name: 'רותם ביטון', phone: '+972500000111', email: 'rotem.biton@example.com' },
    { name: 'ליאור דגן', phone: '+972500000112', email: 'lior.dagan@example.com' },
    { name: 'סיון אלבז', phone: '+972500000113', email: 'sivan.elbaz@example.com' },
    { name: 'גיא הרשקוביץ', phone: '+972500000114', email: 'guy.h@example.com' },
  ],
  students: [
    { name: 'נועה לוי', grade: 'כיתה ז', parent: 0, subject: 'פסנתר', level: 'מתקדם' },
    { name: 'איתי מזרחי', grade: 'כיתה ה', parent: 1, subject: 'פסנתר', level: 'מתחילים' },
    { name: 'רוני פרידמן', grade: 'כיתה ט', parent: 2, subject: 'פסנתר', level: 'מתקדם' },
    { name: 'עדי גולן', grade: 'כיתה ו', parent: 3, subject: 'פסנתר', level: 'ביניים' },
    { name: 'יהלי ברקוביץ', grade: 'כיתה ד', parent: 4, subject: 'פסנתר', level: 'מתחילים' },
    { name: 'שקד שרון', grade: 'כיתה ח', parent: 5, subject: 'פסנתר', level: 'ביניים' },
    { name: 'אורי נחום', grade: 'כיתה י', parent: 6, subject: 'גיטרה', level: 'מתקדם' },
    { name: 'טל אשכנזי', grade: 'כיתה ז', parent: 7, subject: 'גיטרה', level: 'ביניים' },
    { name: 'ליבי רוזן', grade: 'כיתה ה', parent: 8, subject: 'גיטרה', level: 'מתחילים' },
    { name: 'אורין כרמי', grade: 'כיתה יא', parent: 9, subject: 'גיטרה', level: 'מתקדם' },
    { name: 'עמית ביטון', grade: 'כיתה ו', parent: 10, subject: 'גיטרה', level: 'ביניים' },
    { name: 'יובל לוי', grade: 'כיתה ד', parent: 0, subject: 'גיטרה', level: 'מתחילים' },
    { name: 'מיכאלה דגן', grade: 'כיתה ט', parent: 11, subject: 'כינור', level: 'מתקדם' },
    { name: 'נועם אלבז', grade: 'כיתה ח', parent: 12, subject: 'כינור', level: 'ביניים' },
    { name: 'אלה הרשקוביץ', grade: 'כיתה ז', parent: 13, subject: 'כינור', level: 'ביניים' },
    { name: 'רותם מזרחי', grade: 'כיתה יב', parent: 1, subject: 'כינור', level: 'מתקדם' },
    { name: 'שירה כרמי', grade: 'כיתה ה', parent: 9, subject: 'כינור', level: 'מתחילים' },
    { name: 'איה נחום', grade: 'כיתה ו', parent: 6, subject: 'כינור', level: 'מתחילים' },
  ],
  homework: [
    {
      title: 'אקורדים בסיסיים — Am, C, G',
      body: 'מעברים בין שלושת האקורדים, 5 דקות ביום. לצלם סרטון קצר אם אפשר.',
      status: 'overdue',
      due: -2,
    },
    {
      title: 'קצב 4/4 — תרגילי פריטה',
      body: 'תבנית פריטה למטה-למטה-למעלה, לחזור 20 פעם בלי לעצור.',
      status: 'pending',
      due: 3,
    },
    {
      title: 'תיאוריה: מרווחים',
      body: 'דף העבודה על מרווחים — שאלות 1 עד 12.',
      status: 'done',
      due: -5,
    },
    {
      title: 'ויברטו — תרגול יומי',
      body: 'חמש דקות ויברטו על מיתר לה, יד רפויה. בלי קשת בהתחלה.',
      status: 'pending',
      due: 4,
    },
    {
      title: 'קטע לנשף — חזרה',
      body: 'לנגן את הקטע מתחילתו ועד סופו שלוש פעמים ביום ללא עצירות.',
      status: 'done',
      due: -8,
    },
    {
      title: 'האזנה: קונצ׳רטו לכינור',
      body: 'להאזין לפרק הראשון ולכתוב שתי שורות על מה שאהבתם.',
      status: 'pending',
      due: 5,
    },
    {
      title: 'קריאת תווים — דף 12',
      body: 'קריאה ראשונה (prima vista) של שני הקטעים בדף.',
      status: 'overdue',
      due: -1,
    },
  ],
  notes: [
    'עבדנו על הסולם בשתי ידיים. הקצב יציב, עדיין נוטה למהר בסוף הסולם.',
    'התקדמות יפה באטיוד. האצבוע בתיבה 9 סוף סוף נכנס.',
    'חזרנו על האקורדים — המעבר מ-Am ל-C כבר חלק. נוסיף אקורד רביעי בשבוע הבא.',
    'שיעור נעים. עבדנו על קריאת תווים, יש שיפור ברור לעומת החודש שעבר.',
    'הוויברטו מתחיל להישמע טבעי. להמשיך חמש דקות ביום.',
    'הכנה לנשף — הקטע מנוגן מתחילתו לסופו בלי עצירות. מוכנה.',
  ],
  goals: [
    {
      student: 0,
      subject: 'פסנתר',
      description: 'לנגן את "לאלייז" מתחילתו לסופו בלי עצירות',
      status: 'active',
      months: 3,
    },
    {
      student: 0,
      subject: 'פסנתר',
      description: 'לשלוט בסולם דו מז׳ור בשתי ידיים',
      status: 'achieved',
      months: -1,
    },
    {
      student: 3,
      subject: 'פסנתר',
      description: 'לקרוא תווים בשני מפתחות ברצף',
      status: 'active',
      months: 2,
    },
    {
      student: 6,
      subject: 'גיטרה',
      description: 'לנגן שיר שלם עם שירה במקביל',
      status: 'active',
      months: 4,
    },
    {
      student: 12,
      subject: 'כינור',
      description: 'להופיע בנשף הסטודיו בסוף השנה',
      status: 'active',
      months: 5,
    },
    {
      student: 15,
      subject: 'כינור',
      description: 'לשלוט בוויברטו על כל המיתרים',
      status: 'achieved',
      months: -2,
    },
  ],
  feedback: [
    'עבודה יפה מאוד! הקצב יציב. בשבוע הבא נעלה את המטרונום ל-72.',
    'יפה. כדאי לחזור על ההגדרה של מרווח שלישית לפני השיעור הבא.',
  ],
}

const en: Roster = {
  orgName: 'Harmony Music Studio',
  orgSlug: 'harmony-music-video-demo',
  ownerName: 'Rachel Cohen',
  defaultLocale: 'en',
  teachers: [
    { email: 'michelle@demo.getlessio.com', name: 'Michelle Adams', subject: 'Piano', rate: 240 },
    { email: 'jonathan@demo.getlessio.com', name: 'Jonathan Sage', subject: 'Guitar', rate: 200 },
    { email: 'diana@demo.getlessio.com', name: 'Diana Palmer', subject: 'Violin', rate: 220 },
  ],
  parents: [
    { name: 'Yael Levin', phone: '+972500000101', email: 'yael.levin@example.com' },
    { name: 'Adam Mercer', phone: '+972500000102', email: 'adam.mercer@example.com' },
    { name: 'Sharon Friedman', phone: '+972500000103', email: 'sharon.friedman@example.com' },
    { name: 'Tom Golding', phone: '+972500000104', email: 'tom.golding@example.com' },
    { name: 'Natalie Brooks', phone: '+972500000105', email: 'natalie.b@example.com' },
    { name: 'Omar Sharon', phone: '+972500000106', email: 'omar.sharon@example.com' },
    { name: 'Hila Nahum', phone: '+972500000107', email: 'hila.nahum@example.com' },
    { name: 'Daniel Ash', phone: '+972500000108', email: 'daniel.a@example.com' },
    { name: 'Maya Rosen', phone: '+972500000109', email: 'maya.rosen@example.com' },
    { name: 'Alan Carmi', phone: '+972500000110', email: 'alan.carmi@example.com' },
    { name: 'Rotem Bitton', phone: '+972500000111', email: 'rotem.bitton@example.com' },
    { name: 'Liam Dagan', phone: '+972500000112', email: 'liam.dagan@example.com' },
    { name: 'Sivan Elbaz', phone: '+972500000113', email: 'sivan.elbaz@example.com' },
    { name: 'Guy Hershko', phone: '+972500000114', email: 'guy.h@example.com' },
  ],
  students: [
    { name: 'Noa Levin', grade: 'Grade 7', parent: 0, subject: 'Piano', level: 'Advanced' },
    { name: 'Ethan Mercer', grade: 'Grade 5', parent: 1, subject: 'Piano', level: 'Beginner' },
    { name: 'Ronny Friedman', grade: 'Grade 9', parent: 2, subject: 'Piano', level: 'Advanced' },
    { name: 'Adi Golding', grade: 'Grade 6', parent: 3, subject: 'Piano', level: 'Intermediate' },
    { name: 'Yali Brooks', grade: 'Grade 4', parent: 4, subject: 'Piano', level: 'Beginner' },
    { name: 'Shaked Sharon', grade: 'Grade 8', parent: 5, subject: 'Piano', level: 'Intermediate' },
    { name: 'Uri Nahum', grade: 'Grade 10', parent: 6, subject: 'Guitar', level: 'Advanced' },
    { name: 'Tal Ash', grade: 'Grade 7', parent: 7, subject: 'Guitar', level: 'Intermediate' },
    { name: 'Libby Rosen', grade: 'Grade 5', parent: 8, subject: 'Guitar', level: 'Beginner' },
    { name: 'Orin Carmi', grade: 'Grade 11', parent: 9, subject: 'Guitar', level: 'Advanced' },
    { name: 'Amit Bitton', grade: 'Grade 6', parent: 10, subject: 'Guitar', level: 'Intermediate' },
    { name: 'Yuval Levin', grade: 'Grade 4', parent: 0, subject: 'Guitar', level: 'Beginner' },
    { name: 'Michaela Dagan', grade: 'Grade 9', parent: 11, subject: 'Violin', level: 'Advanced' },
    { name: 'Noam Elbaz', grade: 'Grade 8', parent: 12, subject: 'Violin', level: 'Intermediate' },
    { name: 'Ella Hershko', grade: 'Grade 7', parent: 13, subject: 'Violin', level: 'Intermediate' },
    { name: 'Rotem Mercer', grade: 'Grade 12', parent: 1, subject: 'Violin', level: 'Advanced' },
    { name: 'Shira Carmi', grade: 'Grade 5', parent: 9, subject: 'Violin', level: 'Beginner' },
    { name: 'Aya Nahum', grade: 'Grade 6', parent: 6, subject: 'Violin', level: 'Beginner' },
  ],
  homework: [
    {
      title: 'Basic chords — Am, C, G',
      body: 'Move between the three chords, 5 minutes a day. Record a short clip if you can.',
      status: 'overdue',
      due: -2,
    },
    {
      title: '4/4 rhythm — strumming drills',
      body: 'Down-down-up pattern, 20 repeats without stopping.',
      status: 'pending',
      due: 3,
    },
    {
      title: 'Theory: intervals',
      body: 'The intervals worksheet — questions 1 through 12.',
      status: 'done',
      due: -5,
    },
    {
      title: 'Vibrato — daily practice',
      body: 'Five minutes of vibrato on the A string, loose hand. No bow to start.',
      status: 'pending',
      due: 4,
    },
    {
      title: 'Recital piece — run-through',
      body: 'Play the piece start to finish three times a day with no stops.',
      status: 'done',
      due: -8,
    },
    {
      title: 'Listening: violin concerto',
      body: 'Listen to the first movement and write two lines on what you liked.',
      status: 'pending',
      due: 5,
    },
    {
      title: 'Sight-reading — page 12',
      body: 'First reading (prima vista) of both pieces on the page.',
      status: 'overdue',
      due: -1,
    },
  ],
  notes: [
    'Worked the scale hands together. Tempo is steady, still rushes at the top.',
    'Good progress on the etude. The fingering in bar 9 finally landed.',
    'Went over the chords — the Am to C change is smooth now. Adding a fourth next week.',
    'Good lesson. Worked on sight-reading, clearly better than last month.',
    'The vibrato is starting to sound natural. Keep it to five minutes a day.',
    'Recital prep — piece played start to finish with no stops. Ready.',
  ],
  goals: [
    {
      student: 0,
      subject: 'Piano',
      description: 'Play "Fur Elise" start to finish without stopping',
      status: 'active',
      months: 3,
    },
    {
      student: 0,
      subject: 'Piano',
      description: 'Master the C major scale hands together',
      status: 'achieved',
      months: -1,
    },
    {
      student: 3,
      subject: 'Piano',
      description: 'Sight-read fluently in both clefs',
      status: 'active',
      months: 2,
    },
    {
      student: 6,
      subject: 'Guitar',
      description: 'Play a full song while singing along',
      status: 'active',
      months: 4,
    },
    {
      student: 12,
      subject: 'Violin',
      description: 'Perform at the end-of-year studio recital',
      status: 'active',
      months: 5,
    },
    {
      student: 15,
      subject: 'Violin',
      description: 'Master vibrato on every string',
      status: 'achieved',
      months: -2,
    },
  ],
  feedback: [
    'Lovely work. The tempo is steady. Next week we take the metronome up to 72.',
    'Nice. Worth reviewing the definition of a third before the next lesson.',
  ],
}

export const ROSTER: Record<'he' | 'en', Roster> = { he, en }

/** VIDEO_DEMO_LOCALE selects the tenant; anything but "en" means Hebrew. */
export function activeLocale(): 'he' | 'en' {
  return process.env.VIDEO_DEMO_LOCALE === 'en' ? 'en' : 'he'
}
