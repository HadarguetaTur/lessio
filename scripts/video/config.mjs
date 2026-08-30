/**
 * Capture pipeline configuration — the one place that knows about environments.
 *
 * Every other module in scripts/video/ takes what it needs from here, so a
 * port change or a tenant change is a one-line edit.
 */

export const BASE = process.env.VIDEO_BASE ?? 'http://localhost:3100'

/**
 * Deterministic UUIDs from scripts/seed-video-demo.ts — uid(s) = PREFIX + s.
 * d3000000 is the Hebrew tenant, d4000000 its English twin. The twins are
 * isomorphic (same counts, same mapping, same amounts) so the two runs produce
 * frame-aligned footage; only the strings differ.
 */
const uid = (prefix, suffix) => `${prefix}-0000-4000-8000-${suffix}`

const tenant = (prefix, ownerEmail) => ({
  orgId: uid(prefix, '000000000000'),
  ownerEmail,
  password: process.env.VIDEO_DEMO_PASSWORD ?? 'lessio-video-demo-2026',
  showcaseLessonId: uid(prefix, '000000000003'),
  // parentId(0) / studentId(0) — the mother/daughter pair the script follows.
  parentId: uid(prefix, '000000000200'),
  studentId: uid(prefix, '000000000300'),
})

export const TENANTS = {
  he: tenant('d3000000', 'video-owner@demo.getlessio.com'),
  en: tenant('d4000000', 'video-owner-en@demo.getlessio.com'),
}

/** Back-compat default for anything that still reads a single tenant. */
export const TENANT = TENANTS.he

/**
 * recordVideo.size MUST equal the viewport or Playwright letterboxes inside the
 * video and the ffmpeg pad maths silently double-letterboxes.
 */
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  phone: { width: 780, height: 1688 },
}

export const LOCALES = {
  he: { cookie: 'he', accept: 'he-IL', dir: 'rtl' },
  en: { cookie: 'en', accept: 'en-US', dir: 'ltr' },
}

export const FPS = 30

export const OUT = {
  raw: (loc) => `video-assets/raw/${loc}`,
  clips: (loc) => `video-assets/clips/${loc}`,
  stills: (loc) => `video-assets/stills/${loc}`,
  manifest: (loc) => `video-assets/manifest-${loc}.json`,
  log: 'video-assets/capture.log',
}
