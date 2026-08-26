'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserRound,
  BookOpen,
  ClipboardList,
  Receipt,
  Settings,
  LogOut,
  UserPlus,
  CalendarDays,
  MessageSquare,
  CreditCard,
  Clock,
  CalendarX,
  Plus,
  BarChart2,
  ChevronDown,
  Banknote,
  Wallet,
} from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
import { SETTINGS_NAV, filterNav } from '@/lib/navigation/registry'
import type { SaasFeatures } from '@/lib/saas/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles?: string[]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'
}

interface NavLinkProps {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  indent?: boolean
}

function NavLink({ href, label, icon: Icon, active, indent }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-md text-[13px] transition-all duration-150 relative max-lg:min-h-11 ${
        indent ? 'px-3 py-1.5' : 'px-3 py-2'
      } ${
        active
          ? 'bg-sidebar-accent text-sidebar-primary font-medium'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-normal'
      }`}
    >
      {active && (
        <span className="absolute end-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary" />
      )}
      <Icon
        size={14}
        className={`shrink-0 transition-transform duration-150 group-hover:scale-110 ${
          active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60'
        }`}
      />
      {label}
    </Link>
  )
}

interface CollapsibleSectionProps {
  label: string
  icon: React.ElementType
  items: NavItem[]
  userRole: string
  pathname: string
  defaultOpen?: boolean
  /** When the section has an index page of its own, the label navigates to it. */
  href?: string
}

function CollapsibleSection({ label, icon: SectionIcon, items, userRole, pathname, defaultOpen, href }: CollapsibleSectionProps) {
  const visibleItems = items.filter(({ roles }) => !roles || roles.includes(userRole))
  // The section's own index page counts as active too, so landing on /settings
  // from the label link (or a breadcrumb) leaves the group open rather than
  // collapsing under you.
  const isAnyActive =
    (href ? pathname === href || pathname.startsWith(href + '/') : false) ||
    visibleItems.some(
      ({ href: itemHref }) => pathname === itemHref || pathname.startsWith(itemHref + '/')
    )
  // Open follows the active route unless the user has said otherwise for this
  // route. Without the reset, opening /charges from a link elsewhere left the
  // section collapsed and you could not see where you were.
  const [override, setOverride] = useState<boolean | null>(null)
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOverride(null)
  }
  const open = override ?? (defaultOpen || isAnyActive)

  if (visibleItems.length === 0) return null

  const rowCls = `group flex items-center rounded-md text-[13px] transition-all duration-150 max-lg:min-h-11 ${
    isAnyActive
      ? 'text-sidebar-foreground font-medium'
      : 'text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/40'
  }`
  const labelContent = (
    <span className="flex items-center gap-2.5">
      <SectionIcon size={14} className={`shrink-0 ${isAnyActive ? 'text-sidebar-foreground/80' : 'text-sidebar-foreground/60'}`} />
      {label}
    </span>
  )
  const chevron = (
    <ChevronDown
      size={13}
      className={`text-sidebar-foreground/50 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
    />
  )

  return (
    <div>
      {/* With an index page the label and the chevron are two siblings, never a
          button nested inside a link: clicking the word Settings goes to the
          hub, clicking the chevron only folds the group. */}
      {href ? (
        <div className={`${rowCls} justify-between pe-1`}>
          <Link href={href} onClick={() => setOverride(true)} className="flex flex-1 items-center px-3 py-2">
            {labelContent}
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-label={label}
            onClick={() => setOverride(!open)}
            className="flex items-center rounded-md px-2 py-2"
          >
            {chevron}
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOverride(!open)}
          className={`${rowCls} w-full justify-between px-3 py-2`}
        >
          {labelContent}
          {chevron}
        </button>
      )}

      {/* grid-rows rather than max-height: settings has twelve entries and was
          being clipped by the old max-h-96 ceiling. `inert` while collapsed —
          without it the hidden links stay in the tab order and Tab walks
          through a dozen invisible stops. */}
      <div
        inert={!open}
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden pt-0.5 space-y-0.5 pe-2">
          {visibleItems.map(({ href, label: itemLabel, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <NavLink key={href} href={href} label={itemLabel} icon={Icon} active={active} indent />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function hasSaasNav(features: SaasFeatures | undefined, key: keyof SaasFeatures): boolean {
  if (!features) return true
  return features[key]
}

interface SidebarProps {
  userName: string
  userRole: string
  mobile?: boolean
  /** When set (owner/admin), hides nav entries not included in the org SaaS plan. */
  saasFeatures?: SaasFeatures
  /** Active teachers in the org; 1 hides the teacher-management section. */
  teacherCount?: number
}

export function Sidebar({
  userName,
  userRole,
  mobile = false,
  saasFeatures,
  teacherCount,
}: SidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const initials = getInitials(userName)
  const isTeacher = userRole === 'teacher'
  const soloTeacher = teacherCount !== undefined && teacherCount <= 1

  // Six things a tutor navigates between, not twenty-nine. Reports are filed
  // under the subject they report on — she thinks "how are my students doing",
  // not "let me open the reports folder". Teachers only exists once there is
  // more than one, so a solo tutor never sees a section about staff.
  const studentsGroup: NavItem[] = [
    { href: '/students',         label: t('students'),        icon: GraduationCap, roles: ['owner', 'admin', 'teacher'] },
    { href: '/parents',          label: t('parents'),         icon: Users,         roles: ['owner', 'admin', 'teacher'] },
    { href: '/leads',            label: t('leads'),           icon: UserPlus,      roles: ['owner', 'admin'] },
    { href: '/reports/students', label: t('reportsStudents'), icon: BarChart2,     roles: ['owner', 'admin'] },
  ]

  const lessonsGroup: NavItem[] = [
    { href: '/lessons',         label: t('lessons'),        icon: BookOpen,      roles: ['owner', 'admin'] },
    { href: '/homework',        label: t('homework'),       icon: ClipboardList, roles: ['owner', 'admin', 'teacher'] },
    { href: '/reports/lessons', label: t('reportsLessons'), icon: BarChart2,     roles: ['owner', 'admin'] },
  ]

  const moneyGroup: NavItem[] = [
    { href: '/charges',         label: t('charges'),        icon: Receipt,    roles: ['owner', 'admin'] },
    { href: '/billing',         label: t('billing'),        icon: Banknote,   roles: ['owner', 'admin'] },
    { href: '/billing/debts',   label: t('debts'),          icon: Wallet,     roles: ['owner', 'admin'] },
    { href: '/subscriptions',   label: t('subscriptions'),  icon: CreditCard, roles: ['owner', 'admin'] },
    { href: '/reports/revenue', label: t('reportsRevenue'), icon: BarChart2,  roles: ['owner', 'admin'] },
    { href: '/reports/debt',    label: t('reportsDebt'),    icon: BarChart2,  roles: ['owner', 'admin'] },
  ]

  const teachersGroup: NavItem[] = [
    { href: '/teachers',                    label: t('teachers'),                  icon: UserRound, roles: ['owner', 'admin'] },
    { href: '/reports/teachers',            label: t('reportsTeachers'),           icon: BarChart2, roles: ['owner', 'admin'] },
    { href: '/reports/teacher-performance', label: t('reportsTeacherPerformance'), icon: BarChart2, roles: ['owner', 'admin'] },
  ]

  // Settings comes from the shared registry — the sidebar used to keep its own
  // copy and had silently fallen three pages behind the /settings hub.
  const settingsItems: NavItem[] = filterNav(SETTINGS_NAV, userRole, saasFeatures).map(
    ({ href, navKey, icon }) => ({
      href,
      label: t(navKey as Parameters<typeof t>[0]),
      icon,
    })
  )

  const teacherItems: NavItem[] = [
    { href: '/teacher/dashboard',    label: t('teacherDashboard'),    icon: LayoutDashboard, roles: ['teacher'] },
    { href: '/students',             label: t('teacherStudents'),     icon: GraduationCap,   roles: ['teacher'] },
    { href: '/parents',              label: t('teacherParents'),      icon: Users,           roles: ['teacher'] },
    { href: '/homework',             label: t('teacherHomework'),     icon: ClipboardList,   roles: ['teacher'] },
    { href: '/teacher/schedule',     label: t('teacherSchedule'),     icon: CalendarDays, roles: ['teacher'] },
    { href: '/teacher/calendar',     label: t('teacherCalendar'),     icon: CalendarDays, roles: ['teacher'] },
    { href: '/teacher/new-lesson',   label: t('teacherNewLesson'),    icon: Plus,         roles: ['teacher'] },
    { href: '/teacher/availability', label: t('teacherAvailability'), icon: Clock,        roles: ['teacher'] },
    { href: '/teacher/overrides',        label: t('teacherOverrides'),        icon: CalendarX,    roles: ['teacher'] },
    { href: '/teacher/calendar-connect', label: t('teacherCalendarConnect'),  icon: CalendarDays, roles: ['teacher'] },
  ]

  /** Role, plan gate and solo-tutor mode, applied in one place per group. */
  const visible = (items: NavItem[]) =>
    items
      .filter(({ roles }) => !roles || roles.includes(userRole))
      .filter(({ href }) => {
        if (href === '/leads') return hasSaasNav(saasFeatures, 'leads')
        if (href === '/homework') return hasSaasNav(saasFeatures, 'homework')
        if (href === '/reports/revenue') return true
        if (href.startsWith('/reports/')) return hasSaasNav(saasFeatures, 'full_reports')
        return true
      })

  const visibleStudents = visible(studentsGroup)
  const visibleLessons = visible(lessonsGroup)
  const visibleMoney = visible(moneyGroup)
  // One teacher means every "which teacher?" has a single answer, so the whole
  // section — and the reports that compare teachers — is noise.
  const visibleTeachers = soloTeacher ? [] : visible(teachersGroup)


  return (
    <aside
      className={`bg-sidebar flex flex-col shrink-0 ${
        mobile
          ? 'h-full w-full border-e border-sidebar-border'
          : 'hidden lg:flex w-60 h-full min-h-0 border-e border-sidebar-border'
      }`}
    >
      {/* Logo */}
      <Link
        href={isTeacher ? '/teacher/dashboard' : '/dashboard'}
        className="h-14 flex items-center px-4 gap-2.5 shrink-0 border-b border-sidebar-border hover:opacity-80 transition-opacity"
      >
        <div className="w-7 h-7 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold leading-none">L</span>
        </div>
        <span className="text-[15px] font-semibold text-white tracking-tight">LESSIO</span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto scrollbar-thin">

        {/* Teacher section */}
        {isTeacher && (
          <div className="space-y-0.5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold text-sidebar-foreground/70 uppercase tracking-widest">
              {t('teacherSection')}
            </p>
            {teacherItems.filter(({ roles }) => !roles || roles.includes(userRole)).map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return <NavLink key={href} href={href} label={label} icon={Icon} active={active} />
            })}
          </div>
        )}

        {/* Owner/admin: six sections, each a place rather than a page. */}
        {!isTeacher && (
          <div className="space-y-0.5">
            <NavLink
              href="/dashboard"
              label={t('dashboard')}
              icon={LayoutDashboard}
              active={pathname === '/dashboard'}
            />

            <CollapsibleSection
              label={t('sections.students')}
              icon={GraduationCap}
              items={visibleStudents}
              userRole={userRole}
              pathname={pathname}
            />
            <CollapsibleSection
              label={t('sections.lessons')}
              icon={BookOpen}
              items={visibleLessons}
              userRole={userRole}
              pathname={pathname}
            />
            <CollapsibleSection
              label={t('sections.money')}
              icon={Banknote}
              items={visibleMoney}
              userRole={userRole}
              pathname={pathname}
            />
            {visibleTeachers.length > 0 && (
              <CollapsibleSection
                label={t('sections.teachers')}
                icon={UserRound}
                items={visibleTeachers}
                userRole={userRole}
                pathname={pathname}
              />
            )}

            <NavLink
              href="/messages"
              label={t('messages')}
              icon={MessageSquare}
              active={pathname === '/messages' || pathname.startsWith('/messages/')}
            />
          </div>
        )}

        {/* Collapsible: Reports (teacher) */}
        {isTeacher && (
          <div className="pt-1">
            <CollapsibleSection
              label={t('sections.reports')}
              icon={BarChart2}
              items={[
                { href: '/teacher/reports/lessons',  label: t('teacherReportsLessons'),  icon: BarChart2,     roles: ['teacher'] },
                { href: '/teacher/reports/students', label: t('teacherReportsStudents'), icon: GraduationCap, roles: ['teacher'] },
              ]}
              userRole={userRole}
              pathname={pathname}
              defaultOpen={false}
            />
          </div>
        )}

        {/* Collapsible: Settings */}
        {!isTeacher && (
          <div className="pt-1">
            <CollapsibleSection
              label={t('sections.settings')}
              icon={Settings}
              href="/settings"
              items={settingsItems}
              userRole={userRole}
              pathname={pathname}
              defaultOpen={false}
            />
          </div>
        )}
      </nav>

      {/* User area */}
      <div className="p-2 border-t border-sidebar-border shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md hover:bg-sidebar-accent transition-colors duration-150 group">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="bg-sidebar-primary/30 text-sidebar-foreground text-[11px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-[13px] font-medium text-sidebar-foreground truncate leading-tight">
                  {userName}
                </p>
                <p className="text-[11px] text-sidebar-foreground/70 leading-tight">
                  {tc(`roles.${userRole}`) ?? userRole}
                </p>
              </div>
              <ChevronDown
                size={13}
                className="text-sidebar-foreground/50 group-hover:text-sidebar-foreground/75 transition-colors shrink-0"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-52">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground">{tc(`roles.${userRole}`) ?? userRole}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form action={signOut} className="w-full">
                <button
                  type="submit"
                  className="flex items-center gap-2 w-full text-sm text-destructive"
                >
                  <LogOut size={13} />
                  {tc('logout')}
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
