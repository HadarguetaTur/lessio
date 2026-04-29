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
  MessageCircle,
  MessageSquare,
  CreditCard,
  Clock,
  CalendarX,
  CalendarOff,
  Bell,
  Plus,
  FileText,
  BarChart2,
  Bot,
  ChevronDown,
  Banknote,
  Languages,
  Wallet,
} from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
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
      className={`group flex items-center gap-2.5 rounded-md text-[13px] transition-all duration-150 relative ${
        indent ? 'px-3 py-1.5' : 'px-3 py-2'
      } ${
        active
          ? 'bg-sidebar-accent text-sidebar-primary font-medium'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground font-normal'
      }`}
    >
      {active && (
        <span className="absolute end-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-sidebar-primary" />
      )}
      <Icon
        size={14}
        className={`shrink-0 transition-transform duration-150 group-hover:scale-110 ${
          active ? 'text-sidebar-primary' : 'text-sidebar-foreground/35'
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
}

function CollapsibleSection({ label, icon: SectionIcon, items, userRole, pathname, defaultOpen }: CollapsibleSectionProps) {
  const visibleItems = items.filter(({ roles }) => !roles || roles.includes(userRole))
  const isAnyActive = visibleItems.some(
    ({ href }) => pathname === href || pathname.startsWith(href + '/')
  )
  const [open, setOpen] = useState(defaultOpen || isAnyActive)

  if (visibleItems.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`group flex items-center justify-between w-full px-3 py-2 rounded-md text-[13px] transition-all duration-150 ${
          isAnyActive
            ? 'text-sidebar-foreground font-medium'
            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/40'
        }`}
      >
        <span className="flex items-center gap-2.5">
          <SectionIcon size={14} className={`shrink-0 ${isAnyActive ? 'text-sidebar-foreground/70' : 'text-sidebar-foreground/30'}`} />
          {label}
        </span>
        <ChevronDown
          size={13}
          className={`text-sidebar-foreground/30 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pt-0.5 space-y-0.5 pe-2">
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
}

export function Sidebar({
  userName,
  userRole,
  mobile = false,
  saasFeatures,
}: SidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const initials = getInitials(userName)
  const isTeacher = userRole === 'teacher'

  const mainItems: NavItem[] = [
    { href: '/dashboard',  label: t('dashboard'),  icon: LayoutDashboard, roles: ['owner', 'admin'] },
    { href: '/students',   label: t('students'),   icon: GraduationCap,   roles: ['owner', 'admin', 'teacher'] },
    { href: '/parents',    label: t('parents'),    icon: Users,           roles: ['owner', 'admin', 'teacher'] },
    { href: '/teachers',   label: t('teachers'),   icon: UserRound,       roles: ['owner', 'admin'] },
    { href: '/lessons',    label: t('lessons'),    icon: BookOpen,        roles: ['owner', 'admin'] },
    { href: '/charges',    label: t('charges'),    icon: Receipt,         roles: ['owner', 'admin'] },
    { href: '/billing',        label: t('billing'),        icon: Banknote,     roles: ['owner', 'admin'] },
    { href: '/subscriptions',  label: t('subscriptions'),  icon: CreditCard,   roles: ['owner', 'admin'] },
    { href: '/leads',          label: t('leads'),          icon: UserPlus,     roles: ['owner', 'admin'] },
    { href: '/homework',   label: t('homework'),   icon: ClipboardList,   roles: ['owner', 'admin', 'teacher'] },
    { href: '/messages',   label: t('messages'),   icon: MessageSquare,   roles: ['owner', 'admin', 'teacher'] },
  ]

  const reportsItems: NavItem[] = [
    { href: '/reports/revenue',  label: t('reportsRevenue'),  icon: BarChart2,     roles: ['owner', 'admin'] },
    { href: '/reports/lessons',  label: t('reportsLessons'),  icon: BookOpen,      roles: ['owner', 'admin'] },
    { href: '/reports/debt',     label: t('reportsDebt'),     icon: Receipt,       roles: ['owner', 'admin'] },
    { href: '/reports/teachers', label: t('reportsTeachers'), icon: UserRound,     roles: ['owner', 'admin'] },
    { href: '/reports/students', label: t('reportsStudents'), icon: GraduationCap, roles: ['owner', 'admin'] },
  ]

  const settingsItems: NavItem[] = [
    { href: '/account/billing',              label: t('accountBilling'),      icon: Wallet,           roles: ['owner'] },
    { href: '/settings/whatsapp',            label: t('settingsWhatsApp'),    icon: MessageCircle,  roles: ['owner'] },
    { href: '/settings/message-templates',   label: t('settingsMessages'),    icon: MessageSquare,  roles: ['owner'] },
    { href: '/settings/payment',             label: t('settingsPayment'),     icon: CreditCard,     roles: ['owner'] },
    { href: '/settings/receipts',            label: t('settingsReceipts'),    icon: FileText,       roles: ['owner'] },
    { href: '/settings/cancellation-policy', label: t('settingsCancellation'),icon: Settings,       roles: ['owner'] },
    { href: '/settings/holidays',            label: t('settingsHolidays'),    icon: CalendarOff,    roles: ['owner', 'admin'] },
    { href: '/settings/reminders',           label: t('settingsReminders'),   icon: Bell,           roles: ['owner'] },
    { href: '/settings/ai-assistant',        label: t('settingsAiAssistant'), icon: Bot,            roles: ['owner'] },
    { href: '/settings/locale',              label: t('settingsLocale'),      icon: Languages,      roles: ['owner', 'admin'] },
  ]

  const teacherItems: NavItem[] = [
    { href: '/teacher/dashboard',    label: t('teacherDashboard'),    icon: LayoutDashboard, roles: ['teacher'] },
    { href: '/students',             label: t('teacherStudents'),     icon: GraduationCap,   roles: ['teacher'] },
    { href: '/parents',              label: t('teacherParents'),      icon: Users,           roles: ['teacher'] },
    { href: '/homework',             label: t('teacherHomework'),     icon: ClipboardList,   roles: ['teacher'] },
    { href: '/teacher/schedule',     label: t('teacherSchedule'),     icon: CalendarDays, roles: ['teacher'] },
    { href: '/teacher/calendar',     label: t('teacherCalendar'),     icon: CalendarDays, roles: ['teacher'] },
    { href: '/teacher/new-lesson',   label: t('teacherNewLesson'),    icon: Plus,         roles: ['teacher'] },
    { href: '/teacher/availability', label: t('teacherAvailability'), icon: Clock,        roles: ['teacher'] },
    { href: '/teacher/overrides',    label: t('teacherOverrides'),    icon: CalendarX,    roles: ['teacher'] },
  ]

  const visibleMainItems = mainItems
    .filter(({ roles }) => !roles || roles.includes(userRole))
    .filter(({ href }) => {
      if (href === '/leads') return hasSaasNav(saasFeatures, 'leads')
      if (href === '/homework') return hasSaasNav(saasFeatures, 'homework')
      return true
    })

  const visibleReportItems = reportsItems.filter(({ roles, href }) => {
    if (roles && !roles.includes(userRole)) return false
    if (href === '/reports/revenue') return true
    return hasSaasNav(saasFeatures, 'full_reports')
  })

  const visibleSettingsItems = settingsItems.filter(({ roles, href }) => {
    if (roles && !roles.includes(userRole)) return false
    if (href === '/settings/whatsapp' || href === '/settings/message-templates') {
      return hasSaasNav(saasFeatures, 'whatsapp_automation')
    }
    if (href === '/settings/ai-assistant') return hasSaasNav(saasFeatures, 'ai_assistant')
    return true
  })

  return (
    <aside
      className={`bg-sidebar flex flex-col shrink-0 ${
        mobile
          ? 'h-full w-full border-e border-sidebar-border'
          : 'hidden lg:flex w-60 min-h-screen border-e border-sidebar-border'
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
            <p className="px-3 pb-1.5 text-[10px] font-semibold text-sidebar-foreground/30 uppercase tracking-widest">
              {t('teacherSection')}
            </p>
            {teacherItems.filter(({ roles }) => !roles || roles.includes(userRole)).map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return <NavLink key={href} href={href} label={label} icon={Icon} active={active} />
            })}
          </div>
        )}

        {/* Main ops section */}
        {!isTeacher && visibleMainItems.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold text-sidebar-foreground/30 uppercase tracking-widest">
              {t('sections.management')}
            </p>
            {visibleMainItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return <NavLink key={href} href={href} label={label} icon={Icon} active={active} />
            })}
          </div>
        )}

        {/* Collapsible: Reports (owner/admin) */}
        {!isTeacher && (
          <div className="pt-1">
            <CollapsibleSection
              label={t('sections.reports')}
              icon={BarChart2}
              items={visibleReportItems}
              userRole={userRole}
              pathname={pathname}
              defaultOpen={false}
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
              items={visibleSettingsItems}
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
                <AvatarFallback className="bg-sidebar-primary/30 text-sidebar-primary text-[11px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-[13px] font-medium text-sidebar-foreground truncate leading-tight">
                  {userName}
                </p>
                <p className="text-[11px] text-sidebar-foreground/40 leading-tight">
                  {tc(`roles.${userRole}`) ?? userRole}
                </p>
              </div>
              <ChevronDown
                size={13}
                className="text-sidebar-foreground/25 group-hover:text-sidebar-foreground/50 transition-colors shrink-0"
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
