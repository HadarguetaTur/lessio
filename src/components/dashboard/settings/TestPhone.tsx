'use client'

/**
 * One test number for the whole templates page.
 *
 * The owner types her own number once at the top; every template row can then
 * send to it. Kept in context rather than in each card so there is one field to
 * fill, and mirrored to localStorage so it survives the next visit.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'

const STORAGE_KEY = 'lessio.template-test-phone'

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Nothing outside React writes the number, so there is nothing to watch. */
const noSubscribe = () => () => {}

type TestPhoneContext = {
  phone: string
  setPhone: (value: string) => void
}

const Ctx = createContext<TestPhoneContext>({ phone: '', setPhone: () => {} })

export function useTestPhone(): TestPhoneContext {
  return useContext(Ctx)
}

export function TestPhoneProvider({ children }: { children: ReactNode }) {
  // Server snapshot is empty so the markup matches on hydration; the stored
  // number arrives on the client pass.
  const stored = useSyncExternalStore(noSubscribe, readStored, () => '')
  const [typed, setTyped] = useState<string | null>(null)
  const phone = typed ?? stored

  const setPhone = useCallback((value: string) => {
    setTyped(value)
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Not worth surfacing — the number just will not be remembered.
    }
  }, [])

  const value = useMemo(() => ({ phone, setPhone }), [phone, setPhone])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function TestPhoneInput() {
  const t = useTranslations('settings.messageTemplates.test')
  const { phone, setPhone } = useTestPhone()

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <label htmlFor="template_test_phone" className="block text-sm font-medium text-gray-900">
        {t('phoneLabel')}
      </label>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('phoneHint')}</p>
      <input
        id="template_test_phone"
        type="tel"
        inputMode="tel"
        dir="ltr"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+972501234567"
        className="mt-2 w-56 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  )
}
