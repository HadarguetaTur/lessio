'use client'

/**
 * What you need before connecting a WhatsApp number, and roughly how long it
 * takes. Shared by /settings/whatsapp and the onboarding wizard so the
 * expectation is set the same way in both places.
 *
 * A client component so the onboarding wizard (client) can render it too; the
 * settings page is a server component and renders it just as happily.
 */

import { useTranslations } from 'next-intl'
import { getSiteContact } from '@/lib/marketing/siteContact'

const META_BUSINESS_URL = 'https://business.facebook.com/'
const META_VERIFICATION_URL = 'https://www.facebook.com/business/help/2058515294227817'

export function WhatsAppRequirements({ className }: { className?: string }) {
  const tp = useTranslations('settings')
  // NEXT_PUBLIC_SUPPORT_EMAIL is inlined into the client bundle at build time.
  const { supportEmail } = getSiteContact()
  const email = supportEmail || 'support@getlessio.com'
  const linkCls = 'underline hover:text-amber-900'

  return (
    <div
      className={`rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 ${className ?? ''}`}
    >
      <p className="font-medium mb-1">{tp('whatsappPage.requirementsTitle')}</p>
      <ul className="list-disc list-inside space-y-1 text-amber-700">
        <li>
          <a href={META_BUSINESS_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {tp('whatsappPage.req1')}
          </a>
        </li>
        <li>
          {tp('whatsappPage.req2')}
          <span className="mt-0.5 block ps-5 text-xs text-amber-800">
            {tp('whatsappPage.req2Hint')}
          </span>
        </li>
        <li>
          <a href={META_VERIFICATION_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {tp('whatsappPage.req3')}
          </a>
        </li>
      </ul>
      <p className="mt-3 text-xs text-amber-800">
        <a href={`mailto:${email}`} className={linkCls}>
          {tp('whatsappPage.requirementsHelp')}
        </a>
      </p>
    </div>
  )
}
