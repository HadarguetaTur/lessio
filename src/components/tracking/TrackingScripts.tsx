import { cookies } from 'next/headers'
import Script from 'next/script'

import {
  CONSENT_COOKIE,
  allowsCategory,
  decodeConsent,
} from '@/lib/tracking/consent'
import { listEnabledDestinations } from '@/lib/tracking/destinations'

/**
 * Renders the enabled tracking pixels, behind consent.
 *
 * Per /docs/sprint-34-scope.md § C, step 3. Server-rendered from
 * `tracking_destinations`, so changing a pixel id is a form submission rather
 * than a redeploy — `NEXT_PUBLIC_*` values are inlined at build time.
 *
 * Nothing renders until the visitor has answered the banner: an unanswered
 * prompt is not consent.
 */
export async function TrackingScripts() {
  const jar = await cookies()
  const consent = decodeConsent(jar.get(CONSENT_COOKIE)?.value)

  // Skip the query entirely for the common case — a first-time visitor who has
  // not answered yet loads no pixels regardless of what is configured.
  if (!consent) return null

  const destinations = (await listEnabledDestinations()).filter((d) =>
    allowsCategory(consent, d.consentCategory)
  )
  if (destinations.length === 0) return null

  return (
    <>
      {destinations.map((destination) => {
        const key = `tracking-${destination.id}`

        if (destination.provider === 'meta_pixel') {
          return (
            <Script id={key} key={key} strategy="afterInteractive">
              {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(destination.externalId)});
fbq('track', 'PageView');`}
            </Script>
          )
        }

        if (destination.provider === 'ga4') {
          return (
            <Script id={key} key={key} strategy="afterInteractive">
              {`(function(){var s=document.createElement('script');s.async=1;
s.src='https://www.googletagmanager.com/gtag/js?id=${destination.externalId}';
document.head.appendChild(s);})();
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;gtag('js',new Date());
gtag('config', ${JSON.stringify(destination.externalId)});`}
            </Script>
          )
        }

        if (destination.provider === 'gtm') {
          return (
            <Script id={key} key={key} strategy="afterInteractive">
              {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer',${JSON.stringify(destination.externalId)});`}
            </Script>
          )
        }

        // google_ads, tiktok and linkedin are registered so an operator can
        // record the id, but their tags are expected to be fired through GTM.
        return null
      })}
    </>
  )
}
