import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { MessageCircle, MessageSquare, CreditCard, Settings, CalendarOff, Bell, FileText, Bot, Languages, Shield, Mail, CalendarDays } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Settings landing page — owner/admin only.
 * Fixes the /settings 404 with a card grid of available settings categories.
 * Per /docs/sprint-13-scope.md § Story 9.
 */

export default async function SettingsPage() {
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/dashboard')

  const t = await getTranslations('settings')

  const SETTING_CARDS = [
    {
      href: '/settings/whatsapp',
      icon: MessageCircle,
      label: t('cards.whatsapp.title'),
      desc: t('cards.whatsapp.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/message-templates',
      icon: MessageSquare,
      label: t('cards.messages.title'),
      desc: t('cards.messages.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/payment',
      icon: CreditCard,
      label: t('cards.payment.title'),
      desc: t('cards.payment.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/receipts',
      icon: FileText,
      label: t('cards.receipts.title'),
      desc: t('cards.receipts.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/cancellation-policy',
      icon: Settings,
      label: t('cards.cancellation.title'),
      desc: t('cards.cancellation.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/holidays',
      icon: CalendarOff,
      label: t('cards.holidays.title'),
      desc: t('cards.holidays.description'),
      ownerOnly: false,
    },
    {
      href: '/settings/reminders',
      icon: Bell,
      label: t('cards.reminders.title'),
      desc: t('cards.reminders.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/ai-assistant',
      icon: Bot,
      label: t('cards.aiAssistant.title'),
      desc: t('cards.aiAssistant.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/locale',
      icon: Languages,
      label: t('cards.locale.title'),
      desc: t('cards.locale.description'),
      ownerOnly: false,
    },
    {
      href: '/settings/privacy',
      icon: Shield,
      label: t('cards.privacy.title'),
      desc: t('cards.privacy.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/email',
      icon: Mail,
      label: t('cards.email.title'),
      desc: t('cards.email.description'),
      ownerOnly: true,
    },
    {
      href: '/settings/calendar',
      icon: CalendarDays,
      label: t('cards.calendar.title'),
      desc: t('cards.calendar.description'),
      ownerOnly: true,
    },
  ]

  const visibleCards = SETTING_CARDS.filter((c) => !c.ownerOnly || role === 'owner')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t('title')}
        subtitle={t('cards.locale.description')}
      />
      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleCards.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="block"
          >
            <Card className="h-full border-border transition-all hover:-translate-y-0.5 hover:ring-primary/20">
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon size={18} />
                  </div>
                  <div>
                    <CardTitle>{label}</CardTitle>
                    <CardDescription>{desc}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {t('cardHint')}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
