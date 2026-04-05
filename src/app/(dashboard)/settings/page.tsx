import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { MessageCircle, MessageSquare, CreditCard, Settings, CalendarOff, Bell, FileText, Bot } from 'lucide-react'

/**
 * Settings landing page — owner/admin only.
 * Fixes the /settings 404 with a card grid of available settings categories.
 * Per /docs/sprint-13-scope.md § Story 9.
 */

const SETTING_CARDS = [
  {
    href: '/settings/whatsapp',
    icon: MessageCircle,
    label: 'WhatsApp',
    desc: 'חיבור מספר WhatsApp של הארגון',
    ownerOnly: true,
  },
  {
    href: '/settings/message-templates',
    icon: MessageSquare,
    label: 'הודעות WhatsApp',
    desc: 'התאמה אישית של הודעות אוטומטיות',
    ownerOnly: true,
  },
  {
    href: '/settings/payment',
    icon: CreditCard,
    label: 'תשלומים',
    desc: 'ספק תשלומים + שליחה אוטומטית',
    ownerOnly: true,
  },
  {
    href: '/settings/receipts',
    icon: FileText,
    label: 'קבלות',
    desc: 'חשבוניות ירוקות — הפקת קבלות אוטומטית',
    ownerOnly: true,
  },
  {
    href: '/settings/cancellation-policy',
    icon: Settings,
    label: 'מדיניות ביטולים',
    desc: 'כללי חיוב על ביטולים',
    ownerOnly: true,
  },
  {
    href: '/settings/holidays',
    icon: CalendarOff,
    label: 'חגים וחופשות',
    desc: 'תאריכים שחוסמים את לוח הזמינות',
    ownerOnly: false,
  },
  {
    href: '/settings/reminders',
    icon: Bell,
    label: 'תזכורות',
    desc: 'תזכורות שיעורים ותשלומים אוטומטיות',
    ownerOnly: true,
  },
  {
    href: '/settings/ai-assistant',
    icon: Bot,
    label: 'עוזר AI',
    desc: 'מענה אוטומטי לשאלות הורים ב-WhatsApp',
    ownerOnly: true,
  },
]

export default async function SettingsPage() {
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/dashboard')

  const visibleCards = SETTING_CARDS.filter((c) => !c.ownerOnly || role === 'owner')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">הגדרות</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {visibleCards.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 p-5 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <Icon size={22} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
