import type { MetadataRoute } from 'next'

import { getShareableBaseUrl } from '@/lib/url/appUrl'

/** Only the public marketing/legal surface — everything else is behind auth. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getShareableBaseUrl()
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/data-deletion`, changeFrequency: 'monthly', priority: 0.2 },
  ]
}
