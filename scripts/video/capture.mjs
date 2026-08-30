/**
 * The capture runner.
 *
 *   node scripts/video/capture.mjs --locales he,en [--only id1,id2] [--headed]
 *
 * Records one .webm per shot, writes a still per shot, and emits a manifest the
 * postprocess step turns into frame-exact clips.
 *
 * The clapper: every shot loads behind an opaque black curtain and lifts it in
 * one frame at take start. Playwright's screencast is VFR and drops frames under
 * load, so wall-clock deltas locate the take start 2-6 frames off — which is
 * exactly enough to stop one edit working across two languages. ffmpeg finds the
 * curtain lift with blackdetect instead, in the video's own clock.
 */

import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { DateTime } from 'luxon'
import { launch, newShotContext, instrument } from './browser.mjs'
import { motion } from './motion.mjs'
import { quietSettled, liftCurtain } from './quiet.mjs'
import { makeT, makeByKey } from './i18n.mjs'
import { loadEnvLocal, ownerState, portalCookie, bookingToken } from './auth.mjs'
import { SHOTS } from './shots.mjs'
import { BASE, OUT, LOCALES, TENANTS } from './config.mjs'

loadEnvLocal()

const argv = process.argv.slice(2)
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.split('=').slice(1).join('=') : d
}
const LOCALES_TO_RUN = arg('locales', 'he').split(',').filter(Boolean)
const ONLY = (arg('only', '') || '').split(',').filter(Boolean)
const HEADED = argv.includes('--headed')

function log(line) {
  const stamp = new Date().toISOString().slice(11, 23)
  mkdirSync('video-assets', { recursive: true })
  appendFileSync(OUT.log, `${stamp} ${line}\n`)
  console.log(`  ${stamp} ${line}`)
}

/**
 * The seed is DateTime.now()-relative and "today's lessons" is server-rendered
 * per request, so a date rollover between the he and en runs silently changes
 * the data under the second one.
 */
function guardMidnight() {
  const now = DateTime.now().setZone('Asia/Jerusalem')
  const toMidnight = now.endOf('day').diff(now, 'minutes').minutes
  if (toMidnight < 25) {
    throw new Error(
      `Refusing to start: ${Math.round(toMidnight)} min to midnight Asia/Jerusalem. ` +
        'A date rollover mid-run changes the seeded data between locales.'
    )
  }
}

async function runShot(browser, shot, loc, ctxDeps) {
  const videoDir = `${OUT.raw(loc)}/_tmp-${shot.id}`
  rmSync(videoDir, { recursive: true, force: true })

  const extraCookies = shot.shell === 'portal' ? [await ctxDeps.portalCookie(ctxDeps.locale)] : []
  const storageState = shot.shell === 'dashboard' ? ctxDeps.owner.state : undefined

  const ctx = await newShotContext(browser, {
    viewport: shot.viewport,
    locale: loc,
    storageState,
    videoDir,
    extraCookies,
  })

  // router.refresh() from Supabase realtime mid-take reflows the page and
  // desyncs the two runs. Only the shot that films a live arrival wants it.
  if (!shot.flags?.realtime) {
    await ctx.route('**/realtime/v1/**', (r) => r.abort())
  }

  const page = await ctx.newPage()
  const { con, net } = instrument(page)
  const t = makeT(loc)
  const byKey = (key, role) => makeByKey(loc)(page, key, role)

  const url = typeof shot.route === 'function' ? await shot.route(ctxDeps) : shot.route
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Everything below happens behind the curtain.
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  if (shot.prep) await shot.prep({ page, t, byKey, m: motion(page) })
  await quietSettled(page, { toasts: shot.flags?.toasts })
  await page.waitForTimeout(shot.settleMs ?? 900)

  const m = motion(page)
  await page.mouse.move(60, 60)
  await page.waitForTimeout(200)

  // Take starts here.
  await liftCurtain(page)
  const t0 = Date.now()
  await m.hold(400)
  try {
    if (shot.action) await shot.action(m, { page, t, byKey })
  } catch (err) {
    log(`  ! action failed for ${shot.id}: ${err.message}`)
    throw err
  }
  const actionMs = Date.now() - t0
  await m.hold(shot.tailPadMs ?? 2400)

  if (shot.still !== 'none') {
    await m.hideCursor()
    await page.waitForTimeout(150)
    mkdirSync(OUT.stills(loc), { recursive: true })
    await page.screenshot({
      path: `${OUT.stills(loc)}/${shot.index}-${shot.id}.png`,
      fullPage: false,
    })
  }

  const video = page.video()
  await ctx.close()
  const dest = `${OUT.raw(loc)}/${shot.id}.webm`
  if (video) await video.saveAs(dest)
  rmSync(videoDir, { recursive: true, force: true })

  if (actionMs > shot.nominalMs * 0.85) {
    log(`  ! ${shot.id}: action ${actionMs}ms vs nominal ${shot.nominalMs}ms — widen nominalMs`)
  }
  if (con.length) log(`  ! ${shot.id}: ${con.length} console error(s): ${con[0]}`)

  return {
    id: shot.id,
    index: shot.index,
    beat: shot.beat,
    route: url,
    shell: shot.shell,
    dir: LOCALES[loc].dir,
    viewport: shot.viewport ?? 'desktop',
    nominalMs: shot.nominalMs,
    frames: Math.round((shot.nominalMs * 30) / 1000),
    actionMs,
    consoleErrors: con.slice(0, 5),
    networkErrors: net.slice(0, 5),
  }
}

async function main() {
  guardMidnight()
  const shots = SHOTS.map((s, i) => ({ ...s, index: String(i + 1).padStart(2, '0') })).filter(
    (s) => ONLY.length === 0 || ONLY.includes(s.id)
  )
  if (!shots.length) throw new Error('no shots matched --only')

  const browser = await launch({ headed: HEADED })
  const runStartedAt = new Date().toISOString()

  for (const loc of LOCALES_TO_RUN) {
    log(`=== locale ${loc} — ${shots.length} shot(s) ===`)
    const owner = await ownerState(browser, loc)
    log(`logged in as ${TENANTS[loc].ownerEmail} → ${owner.landed}`)
    const deps = { owner, portalCookie, bookingToken, locale: loc, tenant: TENANTS[loc] }

    const results = []
    for (const shot of shots) {
      const started = Date.now()
      try {
        results.push(await runShot(browser, shot, loc, deps))
        log(`✓ ${shot.index}-${shot.id} (${Date.now() - started}ms)`)
      } catch (err) {
        log(`✗ ${shot.index}-${shot.id}: ${err.message}`)
      }
    }
    mkdirSync('video-assets', { recursive: true })
    writeFileSync(OUT.manifest(loc), JSON.stringify({ runStartedAt, locale: loc, shots: results }, null, 2))
    log(`manifest → ${OUT.manifest(loc)} (${results.length}/${shots.length})`)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
