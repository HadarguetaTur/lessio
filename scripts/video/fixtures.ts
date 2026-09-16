/**
 * The on-screen facts, in one place.
 *
 * Release check #1 for the video is that ₪60 in the chat equals ₪60 on the
 * dashboard equals ₪60 in the monthly billing detail. Everything that renders a
 * number reads it from here, so that check is satisfied by construction rather
 * than by eyeball.
 *
 * These mirror the story family staged by scripts/video/stage-story.ts in
 * "מרכז אופק ללמידה — DEMO" (d3000000-): ניצן אזולאי's 16/09 lesson with ליאת
 * נחמיאס, cancelled by the parent. English values are placeholders until an
 * English twin of the center exists.
 */

export const FIXTURES = {
  orgName: { he: 'מרכז אופק ללמידה', en: 'Ofek Learning Center' },

  // Policy: over 24h free, 2–24h 50%, under 2h full. The lesson is 45 min at
  // ₪220/h = ₪165, cancelled inside the partial tier, so the fee is ₪82.50.
  // A monthly-billing org does not quote that fee to the parent — the bot says
  // it is pending the monthly bill (botString 'charge_pending'); the number is
  // shown on the dashboard, where the admin confirms it.
  cancelCharge: '82.50',

  monthAmount: '2,320',
  receiptNumber: '2026-0148',
  debtorCount: 6,

  lessonTime: '13:00',

  studentName: { he: 'ניצן אזולאי', en: 'Nitzan Azoulay' },
  teacherName: { he: 'ליאת נחמיאס', en: 'Liat Nachmias' },
  parentFirstName: { he: 'אייל', en: 'Eyal' },

  lessonDate: { he: '16/09', en: 'Sep 16' },
  nextLessonDate: { he: '07/09', en: 'Sep 7' },
  monthName: { he: 'אוגוסט', en: 'August' },

  chargeLines: {
    he: '• 6 שיעורי פסנתר — ₪1,440\n• מנוי חודשי — ₪880',
    en: '• 6 piano lessons — ₪1,440\n• Monthly plan — ₪880',
  },

  // Fixed clock. A preview that ticks looks live, and the two locales must
  // agree frame for frame.
  // time1–3 match the inbox rows stage-story.ts wrote (applied 15:35 local, rows 15:28–15:30).
  time1: '15:27',
  time2: '15:28',
  time3: '15:30',
  time4: '09:12',
  time5: '09:13',
  time6: '08:05',
  time7: '08:06',
  time8: '17:22',
  time9: '17:24',

  // The "large center" video (scripts/video/stage-center.ts): שקד כץ's lesson
  // with עדי הרוש, cancelled by the parent. Chat times match the inbox rows the
  // staging script wrote. English values are placeholders.
  center: {
    studentName: { he: 'שקד כץ', en: 'Shaked Katz' },
    teacherName: { he: 'עדי הרוש', en: 'Adi Harush' },
    parentFirstName: { he: 'ליאם', en: 'Liam' },
    lessonDate: { he: '16/09', en: 'Sep 16' },
    lessonTime: '16:00',
    time1: '17:45',
    time2: '17:46',
    time3: '17:47',
  },
} as const
