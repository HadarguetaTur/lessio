/**
 * The shot list — data only, no Playwright imports.
 *
 * Ordered to match docs/video-system-tour-script.md. `nominalMs` is the
 * contract: postprocess trims every clip to exactly nominalMs*30/1000 frames
 * starting at the curtain lift, so the he and en cuts are frame-identical by
 * construction rather than by luck.
 *
 * Selectors go through i18n keys (byKey) because the codebase has no
 * data-testid and every visible string differs between locales.
 */


/** The language toggle reads "English" in he and "עברית" in en. */
const localeToggle = (page) =>
  page.locator('button:has-text("English"), button:has-text("עברית")').first()

export const SHOTS = [
  // ── Beat 4 — the dashboard ────────────────────────────────────────────────
  {
    id: 'dash-overview',
    beat: 4,
    shell: 'dashboard',
    route: '/dashboard',
    nominalMs: 6200,
    action: async (m, { page, byKey }) => {
      await m.hold(1400)
      await m.scrollTo(byKey('dashboard.attention.title'), { extra: -110 })
      await m.hold(1600)
    },
  },
  {
    id: 'dash-attention-tick',
    beat: 4,
    shell: 'dashboard',
    route: '/dashboard',
    nominalMs: 9000,
    flags: { toasts: true },
    prep: async ({ page, byKey }) => {
      await byKey('dashboard.attention.title').scrollIntoViewIfNeeded().catch(() => {})
    },
    action: async (m, { page }) => {
      await m.hold(900)
      const box = page.getByRole('checkbox').first()
      await m.click(box, { ms: 780, dwellMs: 320, afterMs: 1900 })
      await m.hold(1200)
    },
  },

  // ── Beat 5 — the calendar ─────────────────────────────────────────────────
  {
    id: 'calendar-week',
    beat: 5,
    shell: 'dashboard',
    route: '/lessons',
    nominalMs: 8000,
    action: async (m, { byKey }) => {
      await m.hold(700)
      await m.click(byKey('lessons.viewWeek', 'button'), { afterMs: 1500 })
      await m.hold(1600)
    },
  },
  {
    id: 'calendar-new-lesson-sheet',
    beat: 5,
    shell: 'dashboard',
    route: '/lessons',
    nominalMs: 11500,
    action: async (m, { byKey }) => {
      await m.hold(600)
      await m.click(byKey('lessons.viewMonth', 'button'), { afterMs: 1400 })
      await m.click(byKey('lessons.newLesson', 'button'), { afterMs: 1800 })
      await m.hold(1200)
    },
  },

  // ── Beat 6 — the billing engine ───────────────────────────────────────────
  {
    id: 'billing-table',
    beat: 6,
    shell: 'dashboard',
    route: '/billing',
    nominalMs: 6200,
    action: async (m) => {
      await m.hold(1600)
      await m.scrollBy(360, 900)
      await m.hold(1800)
    },
  },
  {
    id: 'billing-detail',
    beat: 6,
    shell: 'dashboard',
    route: (deps) => `/billing/${deps.tenant.studentId}`,
    nominalMs: 7000,
    action: async (m) => {
      await m.hold(1500)
      await m.scrollBy(320, 900)
      await m.hold(2200)
    },
  },

  // ── Beat 7 — money out and money owed ─────────────────────────────────────
  {
    id: 'charges',
    beat: 7,
    shell: 'dashboard',
    route: '/charges',
    nominalMs: 6200,
    action: async (m) => {
      await m.hold(1500)
      await m.scrollBy(300, 850)
      await m.hold(1400)
    },
  },
  {
    id: 'debts',
    beat: 7,
    shell: 'dashboard',
    route: '/billing/debts',
    nominalMs: 6600,
    action: async (m) => {
      await m.hold(1600)
      await m.scrollBy(280, 850)
      await m.hold(1600)
    },
  },

  // ── Beat 8 — visibility ───────────────────────────────────────────────────
  {
    id: 'reports-revenue',
    beat: 8,
    shell: 'dashboard',
    route: '/reports/revenue',
    nominalMs: 6400,
    settleMs: 1800,
    action: async (m) => {
      await m.hold(1800)
      await m.scrollBy(260, 850)
      await m.hold(1400)
    },
  },
  {
    id: 'reports-teacher-performance',
    beat: 8,
    shell: 'dashboard',
    route: '/reports/teacher-performance',
    nominalMs: 6000,
    action: async (m) => {
      await m.hold(1500)
      await m.scrollBy(240, 800)
      await m.hold(1200)
    },
  },

  // ── Beat 9 — the parent portal ────────────────────────────────────────────
  {
    id: 'portal-home',
    beat: 9,
    shell: 'portal',
    viewport: 'phone',
    route: (deps) => `/portal/${deps.tenant.orgId}/home`,
    nominalMs: 6600,
    action: async (m) => {
      await m.hold(1600)
      await m.scrollBy(420, 900)
      await m.hold(1600)
    },
  },
  {
    id: 'portal-progress',
    beat: 9,
    shell: 'portal',
    viewport: 'phone',
    route: (deps) => `/portal/${deps.tenant.orgId}/progress`,
    nominalMs: 6000,
    action: async (m) => {
      await m.hold(1500)
      await m.scrollBy(380, 850)
      await m.hold(1300)
    },
  },

  // ── Beat 10 — team, and the same system in two languages ──────────────────
  {
    id: 'teachers',
    beat: 10,
    shell: 'dashboard',
    route: '/teachers',
    nominalMs: 5800,
    action: async (m) => {
      await m.hold(1400)
      await m.scrollBy(220, 800)
      await m.hold(1200)
    },
  },
  {
    id: 'locale-flip',
    beat: 10,
    shell: 'dashboard',
    route: '/dashboard',
    nominalMs: 9400,
    action: async (m, { page }) => {
      await m.hold(1100)
      await m.click(localeToggle(page), { ms: 800, dwellMs: 320, afterMs: 2600 })
      await m.hold(1000)
    },
  },

  // ── Beat 3 — the booking WebView. LAST: it writes a lesson. ───────────────
  {
    id: 'booking-flow',
    beat: 3,
    shell: 'booking',
    viewport: 'phone',
    route: async (deps) => `/book/${await deps.bookingToken(deps.locale)}`,
    nominalMs: 10000,
    action: async (m, { page }) => {
      await m.hold(1500)
      const firstCard = page.locator('button, [role="button"]').filter({ hasText: /\S/ }).nth(1)
      await m.click(firstCard, { ms: 700, afterMs: 1800 }).catch(() => {})
      await m.hold(2200)
    },
  },
]
