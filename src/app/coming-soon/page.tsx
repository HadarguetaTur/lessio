import { signOut } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'

export default async function ComingSoonPage() {
  const t = await getTranslations()
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4" >
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('notFound.comingSoonTitle')}</h1>
        <p className="text-gray-500 mb-8">{t('notFound.comingSoonBody')}</p>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            {t('common.logout')}
          </Button>
        </form>
      </div>
    </main>
  )
}
