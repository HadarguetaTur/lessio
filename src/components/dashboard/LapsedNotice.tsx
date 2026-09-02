import { getTranslations } from 'next-intl/server'

/**
 * What an admin or teacher sees when the org's subscription has lapsed.
 *
 * Only the owner can pay, so everyone else gets an explanation instead of a
 * redirect to a billing page they cannot act on. Rendered in place of the page
 * content, not as a banner: the surfaces behind it are the ones that no longer
 * work (the bot is off, reminders are not going out), and showing them as if
 * they did would be the actual failure.
 */
export async function LapsedNotice() {
  const t = await getTranslations('saas.lapsedNotice')

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-8 dark:border-amber-900/60 dark:bg-amber-950/40">
        <h1 className="text-balance text-lg font-bold tracking-tight text-amber-950 dark:text-amber-100 sm:text-xl">
          {t('title')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-amber-900 dark:text-amber-200">{t('body')}</p>
      </div>
    </div>
  )
}
