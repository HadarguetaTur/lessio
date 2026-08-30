/**
 * One list of the places this product has.
 *
 * Before this file, the sidebar, the /settings hub, the /reports hub and the
 * TopBar breadcrumbs each kept their own private copy of "what pages exist".
 * They drifted: /settings/pricing, /settings/privacy and /settings/calendar had
 * cards but no sidebar entry, and eight routes rendered a breadcrumb of their
 * own URL slug because nobody had added them to the map.
 *
 * ISOMORPHIC — this module is imported by both server components (the hubs) and
 * client components (Sidebar, TopBar, GlobalSearch). Keep it that way:
 *   - no 'use client'
 *   - no supabase / server-only / next/headers imports
 *   - no process.env reads (org readiness lives in
 *     src/lib/organizations/readiness.ts, which IS server-only)
 * lucide icons are safe on both sides — the server settings hub already renders
 * them today.
 *
 * Translation stays with the consumer: entries carry keys, never strings, so a
 * server component can use getTranslations() and a client one useTranslations().
 *
 * The owner sidebar's four categories live here too (CATEGORIES, below): the
 * flat sidebar rows and each page's tab strip render from the same list. The
 * teacher sub-shell stays out — its labels are role-worded ("My students") and
 * it keeps its own flat list in src/components/dashboard/Sidebar.tsx.
 */

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserRound,
  BookOpen,
  ClipboardList,
  Receipt,
  ReceiptText,
  Settings,
  UserPlus,
  MessageCircle,
  MessageSquare,
  CreditCard,
  CalendarOff,
  CalendarDays,
  Plug,
  Bell,
  FileText,
  BarChart2,
  Bot,
  Banknote,
  Languages,
  Wallet,
  Building2,
  Mail,
  Shield,
  LifeBuoy,
} from 'lucide-react'
import type { SaasFeatures } from '@/lib/saas/types'

export type NavRole = 'owner' | 'admin' | 'teacher'

export interface NavEntry {
  href: string
  /** Key under the `nav` namespace. The call to t() stays with the consumer. */
  navKey: string
  /** Key under `settings.cards` / `reports` — only entries shown on a hub. */
  cardKey?: string
  icon: LucideIcon
  /** Absent = visible to every role. */
  roles?: NavRole[]
  saasFeature?: keyof SaasFeatures
  /**
   * Lowercase search aliases, Hebrew and English mixed in one flat list.
   * The title match only ever sees the active UI language, so the other
   * language's name has to live here for "reminder" to find תזכורות.
   */
  synonyms?: string[]
}

/** /account/billing plus all seventeen /settings/* pages. */
export const SETTINGS_NAV: NavEntry[] = [
  {
    href: '/account/billing',
    navKey: 'accountBilling',
    icon: Wallet,
    roles: ['owner'],
    synonyms: ['account', 'billing', 'plan', 'subscription', 'invoice', 'חשבון', 'חיוב', 'מנוי', 'תוכנית', 'חשבונית'],
  },
  {
    href: '/settings/business-profile',
    navKey: 'settingsBusinessProfile',
    cardKey: 'businessProfile',
    icon: Building2,
    roles: ['owner'],
    synonyms: ['business', 'profile', 'company', 'logo', 'עסק', 'פרופיל', 'לוגו', 'פרטי העסק'],
  },
  {
    href: '/settings/whatsapp',
    navKey: 'settingsWhatsApp',
    cardKey: 'whatsapp',
    icon: MessageCircle,
    roles: ['owner'],
    saasFeature: 'whatsapp_automation',
    synonyms: ['whatsapp', 'bot', 'בוט', 'וואטסאפ', 'ווטסאפ', 'connect', 'חיבור', 'מספר'],
  },
  {
    href: '/settings/message-templates',
    navKey: 'settingsMessages',
    cardKey: 'messages',
    icon: MessageSquare,
    roles: ['owner'],
    saasFeature: 'whatsapp_automation',
    synonyms: ['template', 'templates', 'message', 'messages', 'תבנית', 'תבניות', 'הודעה', 'הודעות', 'נוסח'],
  },
  {
    href: '/settings/pricing',
    navKey: 'settingsPricing',
    cardKey: 'pricing',
    icon: Banknote,
    roles: ['owner'],
    synonyms: ['pricing', 'price', 'rate', 'tariff', 'מחיר', 'מחירים', 'תמחור', 'תעריף'],
  },
  {
    href: '/settings/billing-policy',
    navKey: 'settingsBillingPolicy',
    cardKey: 'billingPolicy',
    icon: ReceiptText,
    roles: ['owner'],
    synonyms: ['billing', 'policy', 'subscription', 'coverage', 'covered', 'מדיניות', 'חיוב', 'מנוי', 'מנויים', 'כיסוי'],
  },
  {
    href: '/settings/payment',
    navKey: 'settingsPayment',
    cardKey: 'payment',
    icon: CreditCard,
    roles: ['owner'],
    synonyms: ['payment', 'payments', 'provider', 'card', 'תשלום', 'תשלומים', 'סליקה', 'ספק', 'אשראי'],
  },
  {
    href: '/settings/receipts',
    navKey: 'settingsReceipts',
    cardKey: 'receipts',
    icon: FileText,
    roles: ['owner'],
    synonyms: ['receipt', 'receipts', 'invoice', 'tax', 'קבלה', 'קבלות', 'חשבונית', 'מס'],
  },
  {
    href: '/settings/cancellation-policy',
    navKey: 'settingsCancellation',
    cardKey: 'cancellation',
    icon: Settings,
    roles: ['owner'],
    synonyms: ['cancellation', 'cancel', 'policy', 'charge', 'ביטול', 'ביטולים', 'מדיניות', 'חיוב'],
  },
  {
    href: '/settings/exams',
    navKey: 'settingsExams',
    cardKey: 'exams',
    icon: ClipboardList,
    roles: ['owner', 'admin'],
    synonyms: ['exam', 'exams', 'test', 'quota', 'מבחן', 'מבחנים', 'בוחן', 'מכסה', 'תגבור'],
  },
  {
    href: '/settings/holidays',
    navKey: 'settingsHolidays',
    cardKey: 'holidays',
    icon: CalendarOff,
    roles: ['owner', 'admin'],
    synonyms: ['holiday', 'holidays', 'vacation', 'closed', 'חג', 'חגים', 'חופשה', 'חופשות'],
  },
  {
    href: '/settings/reminders',
    navKey: 'settingsReminders',
    cardKey: 'reminders',
    icon: Bell,
    roles: ['owner'],
    synonyms: ['reminder', 'reminders', 'תזכורת', 'תזכורות', 'late payment', 'debt', 'חוב', 'גביה', 'גבייה'],
  },
  {
    href: '/settings/ai-assistant',
    navKey: 'settingsAiAssistant',
    cardKey: 'aiAssistant',
    icon: Bot,
    roles: ['owner'],
    saasFeature: 'ai_assistant',
    synonyms: ['ai', 'assistant', 'openai', 'gpt', 'עוזר', 'בינה', 'מלאכותית', 'צאט', "צ'אט"],
  },
  {
    href: '/settings/email',
    navKey: 'settingsEmail',
    cardKey: 'email',
    icon: Mail,
    roles: ['owner'],
    synonyms: ['email', 'mail', 'smtp', 'מייל', 'אימייל', 'דואר'],
  },
  {
    href: '/settings/calendar',
    navKey: 'settingsCalendar',
    cardKey: 'calendar',
    icon: CalendarDays,
    roles: ['owner'],
    synonyms: ['calendar', 'google', 'sync', 'יומן', 'סנכרון', 'גוגל'],
  },
  {
    href: '/settings/integrations',
    navKey: 'settingsIntegrations',
    cardKey: 'integrations',
    icon: Plug,
    roles: ['owner'],
    saasFeature: 'integrations',
    synonyms: ['integration', 'integrations', 'api', 'webhook', 'make', 'n8n', 'zapier', 'automation', 'mcp', 'claude', 'אינטגרציה', 'אינטגרציות', 'אוטומציה', 'מפתח', 'חיבור'],
  },
  {
    href: '/settings/privacy',
    navKey: 'settingsPrivacy',
    cardKey: 'privacy',
    icon: Shield,
    roles: ['owner'],
    synonyms: ['privacy', 'gdpr', 'retention', 'delete', 'פרטיות', 'מחיקה', 'שמירת נתונים'],
  },
  {
    href: '/settings/locale',
    navKey: 'settingsLocale',
    cardKey: 'locale',
    icon: Languages,
    roles: ['owner', 'admin'],
    synonyms: ['language', 'locale', 'hebrew', 'english', 'שפה', 'עברית', 'אנגלית', 'תצוגה'],
  },
]

/**
 * Reports. `revenue` carries no saasFeature — it stays available on every plan,
 * matching the sidebar's existing exemption.
 */
export const REPORTS_NAV: NavEntry[] = [
  {
    href: '/reports/revenue',
    navKey: 'reportsRevenue',
    cardKey: 'revenue',
    icon: BarChart2,
    roles: ['owner', 'admin'],
    synonyms: ['revenue', 'income', 'money', 'הכנסה', 'הכנסות', 'כסף', 'מחזור'],
  },
  {
    href: '/reports/lessons',
    navKey: 'reportsLessons',
    cardKey: 'lessons',
    icon: BookOpen,
    roles: ['owner', 'admin'],
    saasFeature: 'full_reports',
    synonyms: ['lesson', 'lessons', 'שיעור', 'שיעורים'],
  },
  {
    href: '/reports/debt',
    navKey: 'reportsDebt',
    cardKey: 'debt',
    icon: Receipt,
    roles: ['owner', 'admin'],
    saasFeature: 'full_reports',
    // The old names ('חובות', 'debt') stay searchable: renaming a page must not
    // make it unfindable for anyone who learned it under the previous label.
    synonyms: ['balance', 'balances', 'outstanding', 'debt', 'debts', 'owed', 'יתרה', 'יתרות', 'חוב', 'חובות'],
  },
  {
    href: '/reports/teachers',
    navKey: 'reportsTeachers',
    cardKey: 'teachers',
    icon: UserRound,
    roles: ['owner', 'admin'],
    saasFeature: 'full_reports',
    synonyms: ['teacher', 'teachers', 'staff', 'מורה', 'מורים', 'צוות'],
  },
  {
    href: '/reports/teacher-performance',
    navKey: 'reportsTeacherPerformance',
    cardKey: 'teacherPerformance',
    icon: BarChart2,
    roles: ['owner', 'admin'],
    saasFeature: 'full_reports',
    synonyms: ['performance', 'teacher performance', 'ביצועים', 'ביצועי מורים'],
  },
  {
    href: '/reports/students',
    navKey: 'reportsStudents',
    cardKey: 'students',
    icon: GraduationCap,
    roles: ['owner', 'admin'],
    saasFeature: 'full_reports',
    synonyms: ['student', 'students', 'attendance', 'תלמיד', 'תלמידים', 'נוכחות'],
  },
]

/**
 * The main working pages. Used for breadcrumbs and search only — the sidebar
 * renders its own six groups (see the note at the top of this file).
 */
export const MAIN_NAV: NavEntry[] = [
  {
    href: '/dashboard',
    navKey: 'dashboard',
    icon: LayoutDashboard,
    roles: ['owner', 'admin'],
    synonyms: ['dashboard', 'home', 'overview', 'לוח', 'בקרה', 'ראשי', 'בית'],
  },
  {
    href: '/students',
    navKey: 'students',
    icon: GraduationCap,
    synonyms: ['student', 'students', 'תלמיד', 'תלמידים'],
  },
  {
    href: '/parents',
    navKey: 'parents',
    icon: Users,
    synonyms: ['parent', 'parents', 'family', 'הורה', 'הורים', 'משפחה'],
  },
  {
    href: '/teachers',
    navKey: 'teachers',
    icon: UserRound,
    roles: ['owner', 'admin'],
    synonyms: ['teacher', 'teachers', 'staff', 'מורה', 'מורים', 'צוות'],
  },
  {
    href: '/lessons',
    navKey: 'lessons',
    icon: BookOpen,
    roles: ['owner', 'admin'],
    synonyms: ['lesson', 'lessons', 'schedule', 'שיעור', 'שיעורים', 'לוח זמנים'],
  },
  {
    href: '/homework',
    navKey: 'homework',
    icon: ClipboardList,
    saasFeature: 'homework',
    synonyms: ['homework', 'assignment', 'שיעורי בית', 'מטלה', 'מטלות'],
  },
  {
    href: '/charges',
    navKey: 'charges',
    icon: Receipt,
    roles: ['owner', 'admin'],
    synonyms: ['charge', 'charges', 'חיוב', 'חיובים'],
  },
  {
    href: '/billing',
    navKey: 'billing',
    icon: Banknote,
    roles: ['owner', 'admin'],
    synonyms: ['billing', 'monthly', 'invoice', 'חיוב חודשי', 'חשבונית'],
  },
  {
    href: '/billing/debts',
    navKey: 'debts',
    icon: Wallet,
    roles: ['owner', 'admin'],
    // The old names ('חייבים', 'Debtors') stay searchable: renaming a page must
    // not make it unfindable for anyone who learned the previous label.
    synonyms: ['collection', 'collect', 'debtor', 'debtors', 'debt', 'debts', 'owed', 'גבייה', 'לגבות', 'חוב', 'חובות', 'חייבים'],
  },
  {
    href: '/subscriptions',
    navKey: 'subscriptions',
    icon: CreditCard,
    roles: ['owner', 'admin'],
    synonyms: ['subscription', 'subscriptions', 'recurring', 'מנוי', 'מנויים'],
  },
  {
    href: '/leads',
    navKey: 'leads',
    icon: UserPlus,
    roles: ['owner', 'admin'],
    saasFeature: 'leads',
    synonyms: ['lead', 'leads', 'enquiry', 'ליד', 'לידים', 'פניות'],
  },
  {
    href: '/messages',
    navKey: 'messages',
    icon: MessageSquare,
    // No saasFeature: the sidebar shows /messages on every plan, and search
    // must not be stricter than the sidebar.
    roles: ['owner', 'admin'],
    synonyms: ['message', 'messages', 'portal', 'inbox', 'הודעה', 'הודעות', 'פורטל', 'תיבה'],
  },
  {
    href: '/support',
    navKey: 'support',
    icon: LifeBuoy,
    roles: ['owner', 'admin'],
    // Registered but deliberately absent from the sidebar: the floating help
    // widget is how you get here. Without an entry, /support and every
    // /support/<uuid> thread render their own URL slug as the breadcrumb.
    synonyms: ['support', 'help', 'ticket', 'תמיכה', 'עזרה', 'פנייה', 'פניות'],
  },
]

/** Teacher workspace routes need names in the shared top bar as well. */
export const TEACHER_NAV: NavEntry[] = [
  { href: '/teacher/dashboard', navKey: 'teacherDashboard', icon: LayoutDashboard, roles: ['teacher'] },
  { href: '/teacher/schedule', navKey: 'teacherSchedule', icon: CalendarDays, roles: ['teacher'] },
  { href: '/teacher/calendar', navKey: 'teacherCalendar', icon: CalendarDays, roles: ['teacher'] },
  { href: '/teacher/new-lesson', navKey: 'teacherNewLesson', icon: BookOpen, roles: ['teacher'] },
  { href: '/teacher/availability', navKey: 'teacherAvailability', icon: CalendarDays, roles: ['teacher'] },
  { href: '/teacher/overrides', navKey: 'teacherOverrides', icon: CalendarOff, roles: ['teacher'] },
  { href: '/teacher/calendar-connect', navKey: 'teacherCalendarConnect', icon: Plug, roles: ['teacher'] },
  { href: '/teacher/reports/lessons', navKey: 'teacherReportsLessons', icon: BarChart2, roles: ['teacher'] },
  { href: '/teacher/reports/students', navKey: 'teacherReportsStudents', icon: GraduationCap, roles: ['teacher'] },
]

/** Section index pages, for the ancestor half of a breadcrumb. */
export const SECTION_HUBS: Record<string, { navKey: string; href: string }> = {
  '/reports': { navKey: 'sections.reports', href: '/reports' },
  '/settings': { navKey: 'sections.settings', href: '/settings' },
  '/teacher': { navKey: 'sections.teacher', href: '/teacher' },
}

/** Every page the global search can land on. */
export const SEARCHABLE_PAGES: NavEntry[] = [
  ...MAIN_NAV,
  ...SETTINGS_NAV,
  ...REPORTS_NAV,
  ...TEACHER_NAV,
]

/**
 * Role gate plus plan gate, in one place.
 * `features` undefined means "show everything" — the same semantics the sidebar
 * has always used for a session with no SaaS plan resolved.
 */
export function filterNav(
  entries: NavEntry[],
  role: string,
  features?: SaasFeatures
): NavEntry[] {
  return entries.filter((entry) => {
    if (entry.roles && !entry.roles.includes(role as NavRole)) return false
    if (entry.saasFeature && features && !features[entry.saasFeature]) return false
    return true
  })
}

export function isNavActive(
  pathname: string,
  href: string,
  siblingHrefs: string[] = []
): boolean {
  if (pathname === href) return true

  if (!pathname.startsWith(href + '/')) return false

  const deeperMatch = siblingHrefs
    .filter((candidate) => candidate !== href)
    .find((candidate) => pathname === candidate || pathname.startsWith(candidate + '/'))

  if (!deeperMatch) return true
  return deeperMatch.length <= href.length
}

const ALL_ROUTES: NavEntry[] = [...MAIN_NAV, ...SETTINGS_NAV, ...REPORTS_NAV, ...TEACHER_NAV]

const ROUTE_BY_HREF = new Map(ALL_ROUTES.map((e) => [e.href, e]))

/**
 * The owner sidebar's four categories, and the tab strip inside each one.
 *
 * A category is a *view* over existing entries — items are references into
 * MAIN_NAV / REPORTS_NAV by href, so roles and plan gating stay defined in
 * exactly one place. The strip renders these as plain links: no URL changes,
 * and "tab in a strip" always means "a distinct pathname" (which is why the
 * students page's internal קבוצות tab is not listed here).
 */
export type CategoryId = 'students' | 'lessons' | 'money' | 'teachers'

export interface NavCategory {
  id: CategoryId
  /** Key under `nav`, e.g. 'sections.students' — sidebar label, strip aria-label, breadcrumb section. */
  sectionKey: string
  icon: LucideIcon
  /** Where the sidebar row lands, and the breadcrumb section href. Always ungated. */
  landing: string
  items: NavEntry[]
}

function entryOf(href: string): NavEntry {
  const entry = ROUTE_BY_HREF.get(href)
  if (!entry) throw new Error(`[navigation] category references unknown route: ${href}`)
  return entry
}

export const CATEGORIES: NavCategory[] = [
  {
    id: 'students',
    sectionKey: 'sections.students',
    icon: GraduationCap,
    landing: '/students',
    items: ['/students', '/parents', '/leads', '/reports/students'].map(entryOf),
  },
  {
    id: 'lessons',
    sectionKey: 'sections.lessons',
    icon: BookOpen,
    landing: '/lessons',
    items: ['/lessons', '/homework', '/reports/lessons'].map(entryOf),
  },
  {
    id: 'money',
    sectionKey: 'sections.money',
    icon: Banknote,
    landing: '/charges',
    items: ['/charges', '/billing', '/billing/debts', '/subscriptions', '/reports/revenue', '/reports/debt'].map(entryOf),
  },
  {
    id: 'teachers',
    sectionKey: 'sections.teachers',
    icon: UserRound,
    landing: '/teachers',
    items: ['/teachers', '/reports/teachers', '/reports/teacher-performance'].map(entryOf),
  },
]

/**
 * Which category a pathname belongs to. An exact item match wins; otherwise
 * the longest item prefix (so /billing/debts is money via its own entry, and
 * /students/<id> is students via the /students prefix). Null for /dashboard,
 * /messages, /settings/*, the /reports hub, teacher routes, and anything
 * unknown.
 */
export function categoryFor(pathname: string): NavCategory | null {
  let best: { category: NavCategory; length: number } | null = null
  for (const category of CATEGORIES) {
    for (const item of category.items) {
      if (pathname === item.href) return category
      if (pathname.startsWith(item.href + '/') && (!best || item.href.length > best.length)) {
        best = { category, length: item.href.length }
      }
    }
  }
  return best?.category ?? null
}

export interface Breadcrumb {
  sectionKey: string | null
  sectionHref: string | null
  pageKey: string | null
}

function sectionFor(pathname: string): { navKey: string; href: string } | null {
  for (const [prefix, hub] of Object.entries(SECTION_HUBS)) {
    if (pathname !== prefix && pathname.startsWith(prefix + '/')) return hub
  }
  return null
}

/**
 * Breadcrumb for a route. Exact match first, then the parent and grandparent
 * paths so that /students/<id>/parents still says "Students" — the prefix
 * fallback the old getBreadcrumbKeys in TopBar did.
 */
export function resolveBreadcrumb(pathname: string): Breadcrumb {
  const hubEntry = SECTION_HUBS[pathname]
  if (hubEntry) {
    return { sectionKey: null, sectionHref: null, pageKey: hubEntry.navKey }
  }

  const section = sectionFor(pathname)

  const exact = ROUTE_BY_HREF.get(pathname)
  if (exact) {
    // A category beats a path-prefix hub: /reports/students reads
    // "תלמידים ‹ דוח תלמידים", not "דוחות ‹ דוח תלמידים". A category's own
    // landing page shows no section — "תלמידים ‹ תלמידים" says nothing.
    const category = categoryFor(pathname)
    if (category && category.landing !== pathname) {
      return {
        sectionKey: category.sectionKey,
        sectionHref: category.landing,
        pageKey: exact.navKey,
      }
    }
    return {
      sectionKey: category ? null : (section?.navKey ?? null),
      sectionHref: category ? null : (section?.href ?? null),
      pageKey: exact.navKey,
    }
  }

  const parts = pathname.split('/')
  const parentPath = parts.slice(0, -1).join('/') || '/'
  const grandParentPath = parts.slice(0, -2).join('/') || '/'
  const pageKey =
    ROUTE_BY_HREF.get(parentPath)?.navKey ??
    ROUTE_BY_HREF.get(grandParentPath)?.navKey ??
    null

  return {
    sectionKey: section?.navKey ?? null,
    sectionHref: section?.href ?? null,
    pageKey,
  }
}

/**
 * Substring match over the translated title plus the entry's synonyms.
 * `getTitle` is injected so this stays a pure function — testable without
 * standing up next-intl.
 */
export function matchPages(
  query: string,
  entries: NavEntry[],
  getTitle: (entry: NavEntry) => string,
  limit = 5
): NavEntry[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  // A page whose own name matches outranks one that only lists the word as a
  // synonym. Without this, typing "גבייה" put /billing first — it carries the
  // word as a synonym — and the page actually called גבייה came second.
  const byTitle: NavEntry[] = []
  const bySynonym: NavEntry[] = []
  for (const entry of entries) {
    const title = getTitle(entry).toLowerCase()
    if (title.includes(q)) byTitle.push(entry)
    else if (entry.synonyms?.some((s) => s.includes(q))) bySynonym.push(entry)
  }
  return [...byTitle, ...bySynonym].slice(0, limit)
}
