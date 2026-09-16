import Link from 'next/link'

import type { LandingContent } from '@/lib/marketing/landingCopy'
import type { SiteContact } from '@/lib/marketing/siteContact'

/**
 * The diary's back cover: status, domain, the legal links Meta and Google
 * review look for, and the business contact details. Centred on phones.
 */
export function DiaryFooter({
  copy,
  siteContact,
  className,
}: {
  copy: LandingContent['footer']
  siteContact: SiteContact
  className?: string
}) {
  return (
    <footer className={`cover mt-auto border-t border-white/10 ${className ?? ''}`} style={{ background: 'var(--cover-deep)' }}>
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-4 px-4 py-8 text-center text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6 sm:text-start lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <span className="muted flex items-center gap-2">
            <span className="size-2 rounded-full bg-[color:var(--hl)]" aria-hidden />
            {copy.statusLabel}
          </span>
          <span className="display tracking-wide">{copy.domain}</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1" aria-label={copy.legalNavLabel}>
          <Link href="/privacy" className="hover:underline">
            {copy.privacy}
          </Link>
          <Link href="/terms" className="hover:underline">
            {copy.terms}
          </Link>
          <Link href="/data-deletion" className="hover:underline">
            {copy.dataDeletion}
          </Link>
        </nav>
        <div className="muted flex w-full flex-col items-center gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6">
          {siteContact.address ? (
            <p>
              {copy.addressLabel}: {siteContact.address}
            </p>
          ) : null}
          {siteContact.supportEmail ? (
            <p>
              {copy.supportLabel}:{' '}
              <a href={`mailto:${siteContact.supportEmail}`} className="hover:underline">
                {siteContact.supportEmail}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
