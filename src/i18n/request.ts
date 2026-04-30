import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

/**
 * Resolves the locale for the current request.
 *
 * Priority:
 *   1. `locale` cookie (set on login or by LocaleSwitcher)
 *   2. `Accept-Language` header — `he*` → `he`, anything else → `en`
 *   3. Default: `he`
 */
function detectLocaleFromAcceptLanguage(acceptLanguage: string | null): 'he' | 'en' {
  if (!acceptLanguage) return 'he'
  // Parse first preference tag (e.g. "he-IL,he;q=0.9,en;q=0.8" → "he")
  const first = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (first.startsWith('he')) return 'he'
  if (first.startsWith('en')) return 'en'
  // Unknown language — default to English as international fallback
  return 'en'
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const headerStore = await headers()

  const cookieLocale = cookieStore.get('locale')?.value as 'he' | 'en' | undefined

  const locale: 'he' | 'en' = cookieLocale ??
    detectLocaleFromAcceptLanguage(headerStore.get('accept-language'))

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
