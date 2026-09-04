import { redirect } from 'next/navigation'
import { Globe, MessageCircle } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PageHeader } from '@/components/ui/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { saveLocaleAction, saveOrgDefaultLocaleAction } from './actions'

const LOCALES = [
  {
    value: 'he',
    title: 'עברית',
    description: 'ברירת המחדל של המוצר, כולל RTL.',
  },
  {
    value: 'en',
    title: 'English',
    description: 'Left-to-right interface for English-speaking staff.',
  },
] as const

export default async function LocaleSettingsPage() {
  const { role, orgId } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/dashboard')

  const locale = await getLocale()
  const t = await getTranslations('settings')

  // The parent-message fallback language is org-wide, so only the owner sets it.
  let orgDefaultLocale: 'he' | 'en' = 'he'
  if (role === 'owner') {
    const db = createServiceRoleClient()
    const { data: org } = await db
      .from('organizations')
      .select('default_locale')
      .eq('id', orgId)
      .single()
    if (org?.default_locale === 'en') orgDefaultLocale = 'en'
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t('locale.title')}
        subtitle={t('locale.subtitle')}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {LOCALES.map((option) => {
          const isActive = locale === option.value
          return (
            <Card
              key={option.value}
              className={cn(
                'border transition-colors',
                isActive && 'ring-2 ring-primary/20'
              )}
            >
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Globe size={16} />
                      {option.title}
                    </CardTitle>
                    <CardDescription>{option.description}</CardDescription>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-xs font-medium',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {isActive ? t('locale.current') : t('locale.available')}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <form action={saveLocaleAction}>
                  <input type="hidden" name="locale" value={option.value} />
                  <Button
                    type="submit"
                    variant={isActive ? 'secondary' : 'outline'}
                    disabled={isActive}
                  >
                    {isActive ? t('locale.currentButton') : t('locale.switchButton')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {role === 'owner' && (
        <Card className="mt-6">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle size={16} />
              {t('locale.parentDefaultTitle')}
            </CardTitle>
            <CardDescription>{t('locale.parentDefaultDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              {LOCALES.map((option) => {
                const isActive = orgDefaultLocale === option.value
                return (
                  <form key={option.value} action={saveOrgDefaultLocaleAction}>
                    <input type="hidden" name="locale" value={option.value} />
                    <Button
                      type="submit"
                      variant={isActive ? 'secondary' : 'outline'}
                      disabled={isActive}
                    >
                      {option.title}
                      {isActive && ` · ${t('locale.current')}`}
                    </Button>
                  </form>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t('locale.parentDefaultPrecedence')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
