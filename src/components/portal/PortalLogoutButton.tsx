'use client'

import { useTranslations } from 'next-intl'
import { LogOut } from 'lucide-react'

/**
 * Ends the portal session on this device.
 *
 * A plain form posting to a server action, so it works with JavaScript off and
 * needs no client state. The action arrives as a prop rather than being
 * imported here: shared UI must not reach into a shell's server actions.
 */
export function PortalLogoutButton({ action }: { action: () => Promise<void> }) {
  const t = useTranslations('portal.session')

  return (
    <form action={action}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        <LogOut size={14} aria-hidden />
        {t('logOut')}
      </button>
    </form>
  )
}
