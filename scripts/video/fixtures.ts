/**
 * The on-screen facts, in one place.
 *
 * Release check #1 for the video is that ₪60 in the chat equals ₪60 on the
 * dashboard equals ₪60 in the monthly billing detail. Everything that renders a
 * number reads it from here, so that check is satisfied by construction rather
 * than by eyeball.
 *
 * These mirror scripts/video-demo-roster.ts index 0 (the mother/daughter pair
 * the script follows) and the cancellation policy in the seeded org.
 */

export const FIXTURES = {
  // Cancellation policy: 24h full, 2h 50%. The showcase lesson is ₪120, cancelled
  // inside the 2h tier, so the charge is ₪60.
  cancelCharge: '60',

  monthAmount: '2,320',
  receiptNumber: '2026-0148',
  debtorCount: 6,

  lessonTime: '14:00',

  studentName: { he: 'נועה לוי', en: 'Noa Levin' },
  teacherName: { he: 'מיכל אברמוב', en: 'Michelle Adams' },
  parentFirstName: { he: 'יעל', en: 'Yael' },

  lessonDate: { he: '31/08', en: 'Aug 31' },
  nextLessonDate: { he: '07/09', en: 'Sep 7' },
  monthName: { he: 'אוגוסט', en: 'August' },

  chargeLines: {
    he: '• 6 שיעורי פסנתר — ₪1,440\n• מנוי חודשי — ₪880',
    en: '• 6 piano lessons — ₪1,440\n• Monthly plan — ₪880',
  },

  // Fixed clock. A preview that ticks looks live, and the two locales must
  // agree frame for frame.
  time1: '21:38',
  time2: '21:40',
  time3: '21:41',
  time4: '09:12',
  time5: '09:13',
  time6: '08:05',
  time7: '08:06',
  time8: '17:22',
  time9: '17:24',
} as const
