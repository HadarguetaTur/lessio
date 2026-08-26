import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/page-header'
import { SETTINGS_NAV, filterNav } from '@/lib/navigation/registry'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Settings landing page — owner/admin only.
 * Cards come from the shared nav registry (src/lib/navigation/registry.ts) so
 * this hub and the sidebar can no longer disagree about which pages exist.
 */

export default async function SettingsPage() {
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/dashboard')

  const t = await getTranslations('settings')
  const tNav = await getTranslations('nav')

  const cards = filterNav(SETTINGS_NAV, role).filter((entry) => entry.cardKey)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map(({ href, navKey, cardKey, icon: Icon }) => (
          <Link key={href} href={href} className="block">
            <Card className="h-full border-border transition-all hover:-translate-y-0.5 hover:ring-primary/20">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon size={18} />
                  </div>
                  <div>
                    <CardTitle>{tNav(navKey as Parameters<typeof tNav>[0])}</CardTitle>
                    <CardDescription>
                      {t(`cards.${cardKey}.description` as Parameters<typeof t>[0])}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
