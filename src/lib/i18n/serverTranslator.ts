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

/** Translator for the `import` namespace (Route Handlers, etc.). */
export async function getImportTranslator(): Promise<ImportT> {
  const locale = await getAppLocale()
  const messages = await loadMessages(locale)
  const t = createTranslator({
    locale,
    messages: messages as Record<string, unknown>,
    namespace: 'import',
  })
  return (key, values) =>
    (t as (k: string, v?: Record<string, string | number | Date>) => string)(key, values)
}
