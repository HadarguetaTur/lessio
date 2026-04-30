export type SiteContact = {
  address: string
  supportEmail: string
}

/** Public contact lines for marketing footer (set in .env.local). */
export function getSiteContact(): SiteContact {
  return {
    address: (process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? '').trim(),
    supportEmail: (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '').trim(),
  }
}
