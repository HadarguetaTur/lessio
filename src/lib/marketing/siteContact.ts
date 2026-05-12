export type SiteContact = {
  address: string
  supportEmail: string
  phone: string
  registrationNumber: string
}

/** Public contact lines for marketing footer and legal pages (set in .env.local). */
export function getSiteContact(): SiteContact {
  return {
    address: (process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? '').trim(),
    supportEmail: (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '').trim(),
    phone: (process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? '').trim(),
    registrationNumber: (process.env.NEXT_PUBLIC_BUSINESS_REG ?? '').trim(),
  }
}
