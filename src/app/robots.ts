import type { MetadataRoute } from 'next'

import { getShareableBaseUrl } from '@/lib/url/appUrl'

export default function robots(): MetadataRoute.Robots {
  const base = getShareableBaseUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated shells and tokenized links have no business in an index.
        disallow: ['/dashboard', '/admin', '/portal/', '/book/', '/pay/', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
