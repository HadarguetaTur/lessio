import { cookies } from 'next/headers'
import { createTranslator } from 'use-intl/core'

export type AppLocale = 'he' | 'en'

export async function getAppLocale(): Promise<AppLocale> {
  const cookieStore = await cookies()
  const v = cookieStore.get('locale')?.value
  return v === 'en' ? 'en' : 'he'
}

export async function loadMessages(locale: AppLocale) {
  return (await import(`../../../messages/${locale}.json`)).default
}

export type ImportT = (key: string, values?: Record<string, string | number | Date>) => string

/**
 * Translator for lib code and Route Handlers — anywhere outside a React tree,
 * where `getTranslations()` from `next-intl/server` is unavailable.
 *
 * Pass `locale` explicitly for recipient-facing text (emails, PDFs, WhatsApp,
 * iCal): those go out in the *recipient's* language, which
 * `resolveRecipientLocale()` decides — not the language the acting user happens
 * to be viewing the dashboard in. Omit it only for text rendered straight back
 * to the current request's user, where the `locale` cookie is the right source.
 */
export async function getT(namespace: string | undefined, locale?: AppLocale): Promise<ImportT> {
  const resolved = locale ?? (await getAppLocale())
  const messages = await loadMessages(resolved)
  const t = createTranslator({
    locale: resolved,
    messages: messages as Record<string, unknown>,
    namespace,
  })
  return (key, values) =>
    (t as (k: string, v?: Record<string, string | number | Date>) => string)(key, values)
}

/** Translator for the `import` namespace (Route Handlers, etc.). */
export async function getImportTranslator(): Promise<ImportT> {
  return getT('import')
}
