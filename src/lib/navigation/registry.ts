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
 * Not here on purpose: the sidebar's own six top-level groups (students,
 * lessons, money, teachers) and the whole teacher sub-shell. Their labels are
 * role-dependent ("My students" vs "Students"), so a flat href→key registry
 * would lose information. See src/components/dashboard/Sidebar.tsx.
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

/** /account/billing plus all fourteen /settings/* pages. */
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
    synonyms: ['debt', 'debts', 'owed', 'חוב', 'חובות', 'חייבים'],
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
    synonyms: ['billing', 'monthly', 'invoice', 'חיוב חודשי', 'חשבונית', 'גבייה'],
  },
  {
    href: '/billing/debts',
    navKey: 'debts',
    icon: Wallet,
    roles: ['owner', 'admin'],
    synonyms: ['debt', 'debts', 'owed', 'חוב', 'חובות', 'חייבים'],
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

const ALL_ROUTES: NavEntry[] = [...MAIN_NAV, ...SETTINGS_NAV, ...REPORTS_NAV]

const ROUTE_BY_HREF = new Map(ALL_ROUTES.map((e) => [e.href, e]))

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
    return {
      sectionKey: section?.navKey ?? null,
      sectionHref: section?.href ?? null,
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

  const hits: NavEntry[] = []
  for (const entry of entries) {
    const title = getTitle(entry).toLowerCase()
    const matched =
      title.includes(q) || (entry.synonyms?.some((s) => s.includes(q)) ?? false)
    if (matched) {
      hits.push(entry)
      if (hits.length >= limit) break
    }
  }
  return hits
}
