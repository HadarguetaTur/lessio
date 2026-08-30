/**
 * Noise suppression, in two stages, plus the clapper curtain.
 *
 * Stage 1 runs before any app code (addInitScript). Stage 2 runs only after the
 * Suspense bands have resolved — freezing skeletons in stage 1 makes the
 * streaming dashboard look dead on load, which is the opposite of the point.
 */

export const CURTAIN_ID = '__lessio-curtain'

export function QUIET_INIT() {
  const style = document.createElement('style')
  style.setAttribute('data-lessio-quiet', '')
  style.textContent = `
    /* Next dev overlay + build indicator (belt and braces; we film a prod build). */
    nextjs-portal, #__next-build-watcher,
    [data-nextjs-toast], [data-nextjs-dev-tools-button] { display:none !important }
    /* Scrollbars appear and vanish mid-take and are RTL-mirrored. */
    ::-webkit-scrollbar { width:0 !important; height:0 !important }
    html { scrollbar-width:none !important }
    /* A focus ring from a real click is good; from a programmatic one it is noise. */
    :focus:not(:focus-visible) { outline:none !important }
    /* Sonner toasts — re-enabled per-shot where the toast IS the beat. */
    body[data-quiet-toasts="1"] [data-sonner-toaster] { display:none !important }
    /* The floating support pill is hidden lg:flex, so it IS on screen at 1920. */
    [data-lessio-hide] { display:none !important }
  `

  const curtain = document.createElement('div')
  curtain.id = '__lessio-curtain'
  curtain.style.cssText =
    'position:fixed;inset:0;background:#000;z-index:2147483645;pointer-events:none'

  function mount() {
    const root = document.documentElement
    if (!root) return
    if (!style.isConnected) root.appendChild(style)
    if (window.__lessioCurtainWanted && !curtain.isConnected) root.appendChild(curtain)
    if (!window.__lessioCurtainWanted && curtain.isConnected) curtain.remove()
  }

  window.__lessioCurtainWanted = true
  window.__lessioLiftCurtain = () => {
    window.__lessioCurtainWanted = false
    curtain.remove()
  }

  const tick = () => { mount(); requestAnimationFrame(tick) }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick))
  } else {
    requestAnimationFrame(tick)
  }
}

/**
 * Ambient-animation freeze. Deliberately NOT prefers-reduced-motion: that would
 * kill AttentionRowCheckbox's done-tick and the NewLessonSheet slide-over, which
 * are exactly why this is video and not stills.
 */
export async function quietSettled(page, { toasts = false } = {}) {
  await page.addStyleTag({
    content: `
      .animate-pulse, .animate-spin { animation:none !important }
      [data-slot="skeleton"] { animation:none !important }
    `,
  }).catch(() => {})
  await page.evaluate((t) => {
    document.body.setAttribute('data-quiet-toasts', t ? '0' : '1')
    // The support launcher carries a locale-dependent aria-label; match on the
    // stable structural signature instead.
    for (const el of document.querySelectorAll('button.fixed.bottom-6, button.fixed.end-6')) {
      el.setAttribute('data-lessio-hide', '')
    }
  }, toasts).catch(() => {})
}

/** Waits until every Recharts area/line path has stopped animating. */
export async function waitForChartsSettled(page, timeout = 6000) {
  await page
    .waitForFunction(
      () => {
        const paths = document.querySelectorAll(
          '.recharts-area-area, .recharts-line-curve, .recharts-bar-rectangle path'
        )
        if (paths.length === 0) return true
        const sig = [...paths].map((p) => p.getAttribute('d') ?? p.getAttribute('height') ?? '').join('|')
        const prev = window.__lessioChartSig
        window.__lessioChartSig = sig
        return prev !== undefined && prev === sig
      },
      { timeout, polling: 250 }
    )
    .catch(() => {})
}

export async function liftCurtain(page) {
  await page.evaluate(() => window.__lessioLiftCurtain?.())
}
