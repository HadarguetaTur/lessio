'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  ClipboardList,
  Settings,
  LogOut,
  CalendarDays,
  MessageSquare,
  Clock,
  CalendarX,
  Plus,
  BarChart2,
  ChevronDown,
  Wallet,
} from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
import { CATEGORIES, categoryFor, filterNav, isNavActive } from '@/lib/navigation/registry'
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
  const sectionHrefs = visibleItems.map(({ href: itemHref }) => itemHref)
  const isAnyActive =
    (href ? isNavActive(pathname, href, sectionHrefs) : false) ||
    visibleItems.some(({ href: itemHref }) => isNavActive(pathname, itemHref, sectionHrefs))
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
            const active = isNavActive(pathname, href, visibleItems.map(({ href: itemHref }) => itemHref))
            return (
              <NavLink key={href} href={href} label={itemLabel} icon={Icon} active={active} indent />
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface SidebarProps {
  userName: string
  userRole: string
  mobile?: boolean
  /** When set (owner/admin), hides nav entries not included in the org SaaS plan. */
  saasFeatures?: SaasFeatures
  /** Active teachers in the org; 1 hides the teacher-management section. */
  teacherCount?: number
  /**
   * The owner/admin also has a teacher record of their own. Hiding the
   * teacher-management section for a solo tutor also hid the only route to
   * their own availability, so they get direct rows instead.
   */
  hasOwnTeacherRecord?: boolean
}

export function Sidebar({
  userName,
  userRole,
  mobile = false,
  saasFeatures,
  teacherCount,
  hasOwnTeacherRecord = false,
}: SidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const initials = getInitials(userName)
  const isTeacher = userRole === 'teacher'
  const soloTeacher = teacherCount !== undefined && teacherCount <= 1

  // Eight flat rows, not four folders: the category rows land on their main
  // page, and once there the tab strip (SectionTabs) shows the siblings — so
  // the sidebar never needs sub-items. Teachers only exists once there is more
  // than one, so a solo tutor never sees a row about staff.
  const activeCategory = isTeacher ? null : categoryFor(pathname)
  const categories = CATEGORIES.filter(
    (c) =>
      !(c.id === 'teachers' && soloTeacher) &&
      filterNav(c.items, userRole, saasFeatures).length > 0
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
              const active = isNavActive(pathname, href, teacherItems.map(({ href: itemHref }) => itemHref))
              return <NavLink key={href} href={href} label={label} icon={Icon} active={active} />
            })}
          </div>
        )}

        {/* Owner/admin: eight flat rows — each category row lands on its main
            page, where the tab strip takes over. */}
        {!isTeacher && (
          <div className="space-y-0.5">
            <NavLink
              href="/dashboard"
              label={t('dashboard')}
              icon={LayoutDashboard}
              active={pathname === '/dashboard'}
            />

            {categories.map((category) => (
              <NavLink
                key={category.id}
                href={category.landing}
                label={t(category.sectionKey as Parameters<typeof t>[0])}
                icon={category.icon}
                active={activeCategory?.id === category.id}
              />
            ))}

            {hasOwnTeacherRecord && (
              <>
                <NavLink
                  href="/teacher/availability"
                  label={t('teacherAvailability')}
                  icon={Clock}
                  active={pathname === '/teacher/availability'}
                />
                <NavLink
                  href="/teacher/overrides"
                  label={t('teacherOverrides')}
                  icon={CalendarX}
                  active={pathname === '/teacher/overrides'}
                />
              </>
            )}

            <NavLink
              href="/reports"
              label={t('sections.reports')}
              icon={BarChart2}
              active={pathname === '/reports'}
            />
            <NavLink
              href="/messages"
              label={t('messages')}
              icon={MessageSquare}
              active={pathname === '/messages' || pathname.startsWith('/messages/')}
            />
            <NavLink
              href="/settings"
              label={t('sections.settings')}
              icon={Settings}
              active={
                pathname === '/settings' ||
                pathname.startsWith('/settings/')
              }
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
            {userRole === 'owner' ? (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/account/billing" className="flex items-center gap-2 w-full text-sm">
                    <Wallet size={13} />
                    {t('accountBilling')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
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
