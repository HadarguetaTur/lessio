import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function ForbiddenPage() {
  const t = await getTranslations()
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6" >
      <div className="max-w-md w-full rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{t('errors.forbiddenTitle')}</h1>
        <p className="mt-3 text-sm text-gray-600">
          {t('errors.forbiddenBody')}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {t('errors.backToDashboard')}
        </Link>
      </div>
    </main>
  )
}
