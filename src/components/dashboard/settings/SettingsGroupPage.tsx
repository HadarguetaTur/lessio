import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronLeft } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getNavigationSaasFeatures } from '@/lib/saas/subscriptions'
import { filterNav, SETTINGS_GROUPS, type SettingsGroupId } from '@/lib/navigation/registry'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export async function SettingsGroupPage({ groupId }: { groupId: SettingsGroupId }) {
  const { orgId, role } = await getSession()
  const group = SETTINGS_GROUPS.find((candidate) => candidate.id === groupId)
  if (!group) return null

  const [t, tNav, features] = await Promise.all([
    getTranslations('settings'),
    getTranslations('nav'),
    getNavigationSaasFeatures(orgId),
  ])
  const cards = filterNav(group.items, role, features).filter((entry) => entry.cardKey)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={tNav(group.navKey as Parameters<typeof tNav>[0])}
        subtitle={t(group.descriptionKey as Parameters<typeof t>[0])}
      />
      <div className="grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ href, navKey, cardKey, icon: Icon }) => (
          <Link key={href} href={href} className="group block">
            <Card className="h-full border-border transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm">
              <CardHeader className="h-full">
                <div className="flex h-full items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon size={18} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle>{tNav(navKey as Parameters<typeof tNav>[0])}</CardTitle>
                    <CardDescription className="mt-1.5 leading-5">
                      {t(`cards.${cardKey}.description` as Parameters<typeof t>[0])}
                    </CardDescription>
                  </div>
                  <ChevronLeft
                    size={16}
                    aria-hidden
                    className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 ltr:rotate-180"
                  />
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
