/**
 * Fictional roster for "מרכז אופק ללמידה — DEMO". Every name here is invented;
 * every phone is in an unallocated range. Nothing maps to a real person.
 */

export type Subject =
  | 'מתמטיקה'
  | 'אנגלית'
  | 'לשון'
  | 'עברית'
  | 'הוראה מתקנת'
  | 'אסטרטגיות למידה'
  | 'הכנה לבגרות במתמטיקה'
  | 'הכנה לבגרות באנגלית'
  | 'הכנה לבגרות בפיזיקה'
  | "הכנה לכיתה א'"
  | 'תגבור'

export type StaffSeed = {
  name: string
  subject: Subject
  rate: number
  role: 'teacher' | 'admin'
  /** Sun=0 … Thu=4 */
  days: number[]
  from: number
  to: number
}

/** 43 teachers + 2 secretaries. */
export const STAFF: StaffSeed[] = [
  { name: 'רונית פלד', subject: 'מתמטיקה', rate: 220, role: 'teacher', days: [0, 1, 2, 3, 4], from: 14, to: 20 },
  { name: 'אורי בן-דוד', subject: 'מתמטיקה', rate: 210, role: 'teacher', days: [0, 1, 3, 4], from: 15, to: 21 },
  { name: 'טל שמעוני', subject: 'מתמטיקה', rate: 200, role: 'teacher', days: [0, 2, 3, 4], from: 14, to: 20 },
  { name: 'נעמה ארד', subject: 'מתמטיקה', rate: 230, role: 'teacher', days: [1, 2, 3, 4], from: 13, to: 19 },
  { name: 'עידו קרמר', subject: 'מתמטיקה', rate: 190, role: 'teacher', days: [0, 1, 2, 4], from: 16, to: 21 },
  { name: 'שני לביא', subject: 'מתמטיקה', rate: 205, role: 'teacher', days: [0, 1, 2, 3, 4], from: 14, to: 19 },
  { name: 'יואב מלכה', subject: 'מתמטיקה', rate: 215, role: 'teacher', days: [1, 2, 3], from: 14, to: 21 },
  { name: 'הילה גבאי', subject: 'אנגלית', rate: 210, role: 'teacher', days: [0, 1, 2, 3, 4], from: 14, to: 20 },
  { name: 'אמיר סבן', subject: 'אנגלית', rate: 200, role: 'teacher', days: [0, 2, 3, 4], from: 15, to: 21 },
  { name: 'ליאת נחמיאס', subject: 'אנגלית', rate: 220, role: 'teacher', days: [0, 1, 3, 4], from: 13, to: 19 },
  { name: 'דניאל רוט', subject: 'אנגלית', rate: 195, role: 'teacher', days: [1, 2, 3, 4], from: 14, to: 20 },
  { name: 'מיה אלקיים', subject: 'אנגלית', rate: 205, role: 'teacher', days: [0, 1, 2, 4], from: 15, to: 20 },
  { name: 'רועי ברנע', subject: 'אנגלית', rate: 200, role: 'teacher', days: [0, 1, 2, 3], from: 14, to: 21 },
  { name: 'ענת זיו', subject: 'לשון', rate: 190, role: 'teacher', days: [0, 1, 2, 3, 4], from: 14, to: 20 },
  { name: 'גלעד עמר', subject: 'לשון', rate: 185, role: 'teacher', days: [0, 2, 4], from: 15, to: 21 },
  { name: 'מורן חדד', subject: 'לשון', rate: 195, role: 'teacher', days: [1, 2, 3, 4], from: 14, to: 19 },
  { name: 'יעל אשר', subject: 'עברית', rate: 185, role: 'teacher', days: [0, 1, 3, 4], from: 14, to: 20 },
  { name: 'ניר סגל', subject: 'עברית', rate: 180, role: 'teacher', days: [0, 1, 2, 3], from: 15, to: 20 },
  { name: 'שירה טולדנו', subject: 'הוראה מתקנת', rate: 240, role: 'teacher', days: [0, 1, 2, 3, 4], from: 13, to: 19 },
  { name: 'איתמר לוין', subject: 'הוראה מתקנת', rate: 235, role: 'teacher', days: [0, 2, 3, 4], from: 14, to: 20 },
  { name: 'קרן אביטל', subject: 'הוראה מתקנת', rate: 245, role: 'teacher', days: [1, 2, 3, 4], from: 14, to: 19 },
  { name: 'תמר מזרחי', subject: 'הוראה מתקנת', rate: 230, role: 'teacher', days: [0, 1, 3], from: 14, to: 21 },
  { name: 'עומר דהן', subject: 'אסטרטגיות למידה', rate: 220, role: 'teacher', days: [0, 1, 2, 3, 4], from: 15, to: 20 },
  { name: 'נוגה בר-לב', subject: 'אסטרטגיות למידה', rate: 225, role: 'teacher', days: [0, 2, 4], from: 14, to: 20 },
  { name: 'אלון פרץ', subject: 'הכנה לבגרות במתמטיקה', rate: 260, role: 'teacher', days: [0, 1, 2, 3, 4], from: 15, to: 21 },
  { name: 'דפנה שלו', subject: 'הכנה לבגרות במתמטיקה', rate: 250, role: 'teacher', days: [0, 1, 3, 4], from: 16, to: 21 },
  { name: 'מתן כץ', subject: 'הכנה לבגרות במתמטיקה', rate: 255, role: 'teacher', days: [1, 2, 3, 4], from: 15, to: 21 },
  { name: 'אביגיל נוי', subject: 'הכנה לבגרות באנגלית', rate: 245, role: 'teacher', days: [0, 1, 2, 3], from: 15, to: 21 },
  { name: 'יונתן גור', subject: 'הכנה לבגרות באנגלית', rate: 240, role: 'teacher', days: [0, 2, 3, 4], from: 16, to: 21 },
  { name: 'סיון ירדני', subject: 'הכנה לבגרות בפיזיקה', rate: 265, role: 'teacher', days: [0, 1, 2, 3, 4], from: 16, to: 21 },
  { name: 'ברק אוחיון', subject: 'הכנה לבגרות בפיזיקה', rate: 260, role: 'teacher', days: [1, 3, 4], from: 15, to: 21 },
  { name: 'רותם שגיא', subject: "הכנה לכיתה א'", rate: 180, role: 'teacher', days: [0, 1, 2, 3], from: 13, to: 18 },
  { name: 'מיכל ברקת', subject: "הכנה לכיתה א'", rate: 175, role: 'teacher', days: [0, 2, 4], from: 13, to: 18 },
  { name: 'אסף מור', subject: 'תגבור', rate: 170, role: 'teacher', days: [0, 1, 2, 3, 4], from: 14, to: 20 },
  { name: 'ליהי צור', subject: 'תגבור', rate: 170, role: 'teacher', days: [0, 1, 3, 4], from: 14, to: 20 },
  { name: 'גיא רביבו', subject: 'תגבור', rate: 165, role: 'teacher', days: [1, 2, 3, 4], from: 15, to: 21 },
  { name: 'עדי הרוש', subject: 'תגבור', rate: 175, role: 'teacher', days: [0, 2, 3], from: 14, to: 20 },
  { name: 'נדב עוז', subject: 'מתמטיקה', rate: 200, role: 'teacher', days: [0, 1, 2, 3, 4], from: 15, to: 20 },
  { name: 'ליאור אזולאי', subject: 'אנגלית', rate: 200, role: 'teacher', days: [0, 1, 2, 3, 4], from: 14, to: 20 },
  { name: 'הדס קליין', subject: 'מתמטיקה', rate: 210, role: 'teacher', days: [0, 1, 3, 4], from: 14, to: 20 },
  { name: 'אלעד שריקי', subject: 'הכנה לבגרות במתמטיקה', rate: 250, role: 'teacher', days: [0, 2, 3, 4], from: 15, to: 21 },
  { name: 'מאיה גולדשטיין', subject: 'אנגלית', rate: 205, role: 'teacher', days: [1, 2, 3, 4], from: 14, to: 20 },
  { name: 'יובל אמסלם', subject: 'לשון', rate: 190, role: 'teacher', days: [0, 1, 2, 4], from: 15, to: 20 },
  { name: 'שרון ויצמן', subject: 'תגבור', rate: 0, role: 'admin', days: [], from: 0, to: 0 },
  { name: 'דורית אלמליח', subject: 'תגבור', rate: 0, role: 'admin', days: [], from: 0, to: 0 },
]

export const FIRST_NAMES_F = [
  'נועה', 'מאיה', 'תמר', 'שירה', 'יעל', 'אביגיל', 'רוני', 'עדי', 'הילה', 'ליה', 'אלה', 'מיקה', 'אריאל', 'רומי',
  'שקד', 'ניצן', 'איילה', 'עלמה', 'טליה', 'אמילי', 'גפן', 'הדר', 'זוהר', 'נעמי', 'ענבר', 'לינוי', 'סתיו', 'אגם',
  'דנה', 'עומר', 'יובל', 'מיה', 'לירון', 'קרן', 'אור', 'שני', 'ליאן', 'אופיר', 'נגה', 'עמית',
]
export const FIRST_NAMES_M = [
  'יואב', 'איתי', 'דניאל', 'אורי', 'עידו', 'נדב', 'יונתן', 'תומר', 'עומרי', 'איתמר', 'ארי', 'נועם', 'אלון', 'רועי',
  'גיא', 'אדם', 'ליאם', 'עילאי', 'בן', 'אריאל', 'מתן', 'לביא', 'רז', 'אייל', 'אופק', 'ניב', 'שחר', 'אביב', 'עמית',
  'יהונתן', 'דור', 'אסף', 'ינון', 'הראל', 'עמרי', 'נהוראי', 'אלעד', 'ברק', 'טל', 'יאיר',
]
export const SURNAMES = [
  'לוי', 'כהן', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'מלכה', 'אזולאי', 'כץ', 'יוסף', 'עמר', 'חדד',
  'גבאי', 'שפירא', 'ברק', 'אוחיון', 'סבן', 'טל', 'רוזן', 'אלון', 'שרון', 'גולן', 'נחום', 'אשכנזי', 'כרמי', 'דגן',
  'אלבז', 'הרשקוביץ', 'בן-דוד', 'סגל', 'קפלן', 'וייס', 'ברנע', 'זיו', 'אדרי', 'חן', 'ממן', 'אלמוג', 'שגב', 'ירדני',
  'מור', 'צור', 'הרוש', 'עוז', 'קליין', 'שריקי', 'גולדשטיין', 'אמסלם', 'ויצמן', 'נוי', 'גור', 'לביא', 'ארד', 'קרמר',
]

export const GRADES = ["כיתה א'", "כיתה ב'", "כיתה ג'", "כיתה ד'", "כיתה ה'", "כיתה ו'", "כיתה ז'", "כיתה ח'", "כיתה ט'", "כיתה י'", 'כיתה י"א', 'כיתה י"ב']
export const LEVELS = ['מתחילים', 'ביניים', 'מתקדם']

/** Which grades a subject is taught in (indexes into GRADES). */
export const SUBJECT_GRADES: Record<Subject, number[]> = {
  'מתמטיקה': [2, 3, 4, 5, 6, 7, 8],
  'אנגלית': [2, 3, 4, 5, 6, 7, 8, 9],
  'לשון': [5, 6, 7, 8, 9, 10],
  'עברית': [0, 1, 2, 3, 4],
  'הוראה מתקנת': [0, 1, 2, 3, 4, 5],
  'אסטרטגיות למידה': [5, 6, 7, 8, 9],
  'הכנה לבגרות במתמטיקה': [9, 10, 11],
  'הכנה לבגרות באנגלית': [9, 10, 11],
  'הכנה לבגרות בפיזיקה': [10, 11],
  "הכנה לכיתה א'": [0],
  'תגבור': [1, 2, 3, 4, 5, 6, 7],
}

/** Group subjects and how many groups of each (sums to 100). */
export const GROUP_MIX: Array<{ subject: Subject; count: number; nameTemplate: (grade: string, n: number) => string; duration: 60 | 90 }> = [
  { subject: 'מתמטיקה', count: 26, nameTemplate: (g, n) => `מתמטיקה ${g} — קבוצה ${n}`, duration: 60 },
  { subject: 'אנגלית', count: 20, nameTemplate: (g, n) => `אנגלית ${g} — קבוצה ${n}`, duration: 60 },
  { subject: 'לשון', count: 8, nameTemplate: (g, n) => `לשון והבעה ${g} — קבוצה ${n}`, duration: 60 },
  { subject: 'עברית', count: 5, nameTemplate: (g, n) => `קריאה וכתיבה ${g} — קבוצה ${n}`, duration: 60 },
  { subject: 'הכנה לבגרות במתמטיקה', count: 10, nameTemplate: (g, n) => `בגרות מתמטיקה 5 יח' ${g} — ${n}`, duration: 90 },
  { subject: 'הכנה לבגרות באנגלית', count: 7, nameTemplate: (g, n) => `בגרות אנגלית ${g} — ${n}`, duration: 90 },
  { subject: 'הכנה לבגרות בפיזיקה', count: 4, nameTemplate: (g, n) => `בגרות פיזיקה ${g} — ${n}`, duration: 90 },
  { subject: 'אסטרטגיות למידה', count: 6, nameTemplate: (g, n) => `אסטרטגיות למידה ${g} — ${n}`, duration: 60 },
  { subject: "הכנה לכיתה א'", count: 5, nameTemplate: (_g, n) => `מוכנות לכיתה א' — קבוצה ${n}`, duration: 60 },
  { subject: 'תגבור', count: 9, nameTemplate: (g, n) => `תגבור ${g} — קבוצה ${n}`, duration: 60 },
]

/** Private-lesson subjects, weighted. */
export const PRIVATE_SUBJECTS: Subject[] = [
  'מתמטיקה', 'מתמטיקה', 'מתמטיקה', 'אנגלית', 'אנגלית', 'הוראה מתקנת', 'הוראה מתקנת', 'לשון',
  'הכנה לבגרות במתמטיקה', 'הכנה לבגרות באנגלית', 'הכנה לבגרות בפיזיקה', 'אסטרטגיות למידה', 'עברית', 'תגבור',
]

export const CANCEL_REASONS_PARENT = ['בוטל על ידי ההורה', 'התלמיד/ה חולה', 'אירוע משפחתי', 'טיול שנתי', 'ההורה ביטל מראש']
export const CANCEL_REASONS_TEACHER = ['המורה נעדר/ה — יום חופש', 'המורה במילואים', 'המורה חולה']
export const RESCHEDULE_REASON = 'הועבר לפי בקשת ההורה'

export const HOMEWORK: Record<string, Array<{ title: string; body: string }>> = {
  'מתמטיקה': [
    { title: 'שברים — דף 3', body: 'לפתור תרגילים 1–12 בדף השברים. לשים לב למכנה משותף.' },
    { title: 'משוואות עם נעלם אחד', body: 'עמוד 84 תרגילים 5–15. לבדוק כל פתרון בהצבה.' },
    { title: 'אחוזים — חזרה למבחן', body: 'לפתור את דף החזרה, כולל שאלות מילוליות 1–6.' },
    { title: 'גיאומטריה — משולשים', body: 'לחשב שטחים והיקפים, תרגילים 3–10.' },
  ],
  'אנגלית': [
    { title: 'Unit 4 — Vocabulary', body: 'Learn the 20 words on page 51 and write a sentence with each.' },
    { title: 'Reading comprehension', body: 'Read the text on page 63 and answer questions 1–8 in full sentences.' },
    { title: 'Past Simple practice', body: 'Worksheet 2 — fill in the correct form of the verb.' },
    { title: 'Unseen — timed', body: 'Do the unseen on page 90 in 25 minutes, then check with the key.' },
  ],
  'לשון': [
    { title: 'תחביר — חלקי המשפט', body: 'לנתח את המשפטים בדף 2: נושא, נשוא, משלימים.' },
    { title: 'הבנת הנקרא', body: 'לקרוא את המאמר ולענות על שאלות 1–5 בתשובות מלאות.' },
  ],
  'עברית': [
    { title: 'קריאה — פרק 3', body: 'לקרוא בקול את פרק 3 ולסמן מילים קשות.' },
    { title: 'כתיבה — סיפור קצר', body: 'לכתוב סיפור של 8 שורות על יום בגן החיות.' },
  ],
  'הוראה מתקנת': [
    { title: 'תרגול פענוח', body: 'לקרוא את דף המילים פעמיים ביום, 5 דקות בכל פעם.' },
    { title: 'כתב יד', body: 'לתרגל את שורות 1–6 בחוברת הכתיבה.' },
  ],
  'אסטרטגיות למידה': [
    { title: 'סיכום פרק בהיסטוריה', body: 'לסכם את פרק 2 בשיטת המפה שלמדנו, עד עמוד אחד.' },
    { title: 'תכנון שבוע לימוד', body: 'למלא את טבלת התכנון לשבוע הבא ולהביא לשיעור.' },
  ],
  'הכנה לבגרות במתמטיקה': [
    { title: 'בעיות תנועה', body: 'שאלות 1–4 ממבחן הבגרות קיץ 2024. לכתוב פתרון מלא.' },
    { title: 'חשבון דיפרנציאלי', body: 'נגזרות — תרגילים 12–24 בעמוד 210.' },
    { title: 'מתכונת א', body: 'לפתור את המתכונת בזמן (3 שעות) ולסמן שאלות לא בטוחות.' },
  ],
  'הכנה לבגרות באנגלית': [
    { title: 'Module E — Unseen', body: 'Complete the unseen from the 2023 exam, questions 1–10.' },
    { title: 'Essay — 120 words', body: 'Write an opinion essay: "Should school start later?"' },
  ],
  'הכנה לבגרות בפיזיקה': [
    { title: 'מכניקה — חוקי ניוטון', body: 'שאלות 3–7 מהמאגר. לצייר דיאגרמת כוחות בכל שאלה.' },
    { title: 'חשמל — מעגלים', body: 'לחשב התנגדות שקולה בתרגילים 1–6.' },
  ],
  "הכנה לכיתה א'": [
    { title: 'אותיות א–ה', body: 'לצבוע ולכתוב את האותיות בחוברת, עמודים 4–6.' },
  ],
  'תגבור': [
    { title: 'חזרה למבחן', body: 'לפתור את דף החזרה שחולק בשיעור ולהביא שאלות.' },
    { title: 'תרגול יומי', body: '10 דקות תרגול בכל יום מהחוברת — לסמן מה נעשה.' },
  ],
}

export const LESSON_NOTES = [
  'עבדנו על הנושא מהשיעור הקודם — יש שיפור ברור, עדיין צריך תרגול בבית.',
  'התלמיד/ה הגיע/ה מוכן/ה, סיימנו את כל התרגילים המתוכננים.',
  'התקשינו בסוף השיעור — נחזור על זה בתחילת השיעור הבא.',
  'הכנו את השיעורי בית ביחד ועברנו על הטעויות במבחן.',
  'שיעור מצוין. סיימנו את הפרק והתחלנו את הבא.',
  'חסר ריכוז היום, קיצרנו את החלק התאורטי ותרגלנו.',
  'עברנו על המבחן שהוחזר — רוב הטעויות מחוסר תשומת לב, לא מחוסר הבנה.',
  'התקדמות יפה — אפשר לשקול לעלות רמה בחודש הבא.',
]

export const GOALS: Array<{ subject: string; description: string; months: number }> = [
  { subject: 'מתמטיקה', description: 'להגיע לציון 85+ במבחן המחצית', months: 3 },
  { subject: 'אנגלית', description: 'לקרוא טקסט לא מוכר ולענות על שאלות בלי מילון', months: 4 },
  { subject: 'לשון', description: 'לשלוט בניתוח תחבירי של משפט מורכב', months: 3 },
  { subject: 'הוראה מתקנת', description: 'קריאה שוטפת של טקסט מנוקד', months: 6 },
  { subject: 'הכנה לבגרות במתמטיקה', description: 'ציון 90 במתכונת לפני מועד קיץ', months: 5 },
  { subject: 'אסטרטגיות למידה', description: 'להכין סיכום עצמאי לכל פרק במדעים', months: 2 },
  { subject: 'תגבור', description: 'לסגור פערים בכפל וחילוק', months: 2 },
]

export const EXAM_TITLES: Record<string, string[]> = {
  'מתמטיקה': ['מבחן שברים', 'מבחן משוואות', 'מבחן מחצית'],
  'אנגלית': ['Unit 4 test', 'Reading test', 'Mid-term'],
  'לשון': ['מבחן תחביר', 'מבחן הבנת הנקרא'],
  'הכנה לבגרות במתמטיקה': ['מתכונת א', 'מתכונת ב'],
  'הכנה לבגרות באנגלית': ['Module E mock', 'Module G mock'],
  'הכנה לבגרות בפיזיקה': ['מתכונת מכניקה'],
  'תגבור': ['מבחן חזרה'],
}

export const LEAD_MESSAGES = [
  'שלום, שמעתי עליכם מחברה. יש מקום לתגבור במתמטיקה לילד בכיתה ז?',
  'היי, אני מחפשת מורה פרטית לאנגלית לבת שלי בכיתה ד. מה המחירים?',
  'שלום, יש לכם קבוצת הכנה לבגרות בפיזיקה 5 יחידות?',
  'הי, בן שלי מתקשה בקריאה (כיתה ב). יש אצלכם הוראה מתקנת?',
  'מתי מתחילה קבוצת המוכנות לכיתה א? יש עוד מקום?',
  'שלום, אפשר לקבל פרטים על אסטרטגיות למידה לתיכון?',
]
