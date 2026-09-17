import { cookies } from 'next/headers'
import Script from 'next/script'

import { ClarityGuard } from '@/components/tracking/ClarityGuard'
import { CONSENT_COOKIE, allowsCategory, decodeConsent } from '@/lib/tracking/consent'
import { listEnabledDestinations } from '@/lib/tracking/destinations'

/**
 * Microsoft Clarity (session recordings, heatmaps) — marketing pages only.
 *
 * Deliberately NOT part of <TrackingScripts /> in the root layout. Clarity
 * records the screen, and Next navigates softly: a script loaded on the landing
 * page would stay alive through /login and into the dashboard, recording
 * students' and parents' details. Clarity documents no call to stop a
 * recording, so the containment is structural — it is rendered only by the
 * landing page, and ClarityGuard turns every way out into a full page load,
 * which is the one thing guaranteed to end it.
 *
 * Same gates as every other pixel: an enabled destination, and consent to its
 * category (decision #49 — third parties always wait for the banner).
 */
export async function ClarityScript({ allowedPaths }: { allowedPaths: readonly string[] }) {
  const jar = await cookies()
  const consent = decodeConsent(jar.get(CONSENT_COOKIE)?.value)
  if (!consent) return null

  const destination = (await listEnabledDestinations()).find(
    (d) => d.provider === 'clarity' && allowsCategory(consent, d.consentCategory)
  )
  if (!destination) return null

  return (
    <>
      <Script id={`tracking-${destination.id}`} strategy="afterInteractive">
        {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window,document,"clarity","script",${JSON.stringify(destination.externalId)});
window.clarity('consent');`}
      </Script>
      <ClarityGuard allowedPaths={allowedPaths} />
    </>
  )
}
