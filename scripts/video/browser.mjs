/**
 * Browser + per-shot context factory.
 *
 * One browser for the whole run (pay Chromium startup once); one CONTEXT per
 * shot, because recordVideo is a context option and a context yields exactly
 * one .webm. Per-shot contexts also give per-shot viewport and per-shot auth,
 * both of which this pipeline needs, and they stop shot N inheriting shot N-1's
 * scroll and cursor drift — which is what breaks he/en alignment by shot 30.
 */

import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { CURSOR_INIT } from './cursor.mjs'
import { QUIET_INIT } from './quiet.mjs'
import { BASE, VIEWPORTS, LOCALES } from './config.mjs'

export function launch() {
  return chromium.launch({
    args: [
      // Without these the palette and glyph rasterisation drift run-to-run,
      // which shows up as a subtle flicker when the two cuts are compared.
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-lcd-text',
      '--hide-scrollbars',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  })
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {{ viewport?: string, locale: string, storageState?: any, videoDir?: string, extraCookies?: any[] }} opts
 */
export async function newShotContext(browser, opts) {
  const vp = VIEWPORTS[opts.viewport ?? 'desktop']
  const loc = LOCALES[opts.locale]

  if (opts.videoDir) mkdirSync(opts.videoDir, { recursive: true })

  const ctx = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 1,
    locale: loc.accept,
    timezoneId: 'Asia/Jerusalem',
    storageState: opts.storageState,
    // size MUST equal viewport or Playwright letterboxes inside the video.
    recordVideo: opts.videoDir ? { dir: opts.videoDir, size: vp } : undefined,
  })

  // Login writes `locale` from profiles.preferred_locale, so a restored
  // storageState already carries he. Overwrite it after every restore.
  await ctx.addCookies([{ name: 'locale', value: loc.cookie, url: BASE }])
  if (opts.extraCookies?.length) await ctx.addCookies(opts.extraCookies)

  await ctx.addInitScript(QUIET_INIT)
  await ctx.addInitScript(CURSOR_INIT)

  return ctx
}

/** Console + network capture, so a red overlay never lands silently in a master. */
export function instrument(page) {
  const con = []
  const net = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') con.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => con.push(`pageerror: ${String(e)}`))
  page.on('response', (r) => {
    if (r.status() >= 400) net.push(`${r.status()} ${r.url().replace(BASE, '')}`)
  })
  return { con, net }
}
