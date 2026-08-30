/**
 * Clapper detect → frame-exact trim → normalize → ProRes.
 *
 *   node scripts/video/postprocess.mjs [--locales he,en] [--only id1,id2]
 *
 * Playwright emits VFR VP8. Wall-clock deltas cannot locate the take start
 * reliably, so the curtain lift is found with blackdetect in the video's own
 * clock and every clip is cut to exactly nominalMs*30/1000 frames from there.
 * That is what makes the he and en timelines identical rather than similar.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { OUT, FPS } from './config.mjs'
import { SHOTS } from './shots.mjs'

/**
 * nominalMs comes from shots.mjs, not the manifest: the raw takes already hold
 * the full action plus tail pad, so retuning a trim length must not require
 * re-shooting — and both locales must always read the same number.
 */
const NOMINAL = Object.fromEntries(SHOTS.map((s) => [s.id, s.nominalMs]))

const argv = process.argv.slice(2)
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.split('=').slice(1).join('=') : d
}
const LOCALES = arg('locales', 'he').split(',').filter(Boolean)
const ONLY = (arg('only', '') || '').split(',').filter(Boolean)

/** ffmpeg writes its filter output (blackdetect included) to stderr, not stdout. */
function ff(args) {
  const res = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return `${res.stdout ?? ''}${res.stderr ?? ''}`
}

/** Total duration of a source file, in seconds. */
function avail(src) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src],
      { encoding: 'utf8' }
    )
    return parseFloat(out.trim()) || 0
  } catch {
    return 0
  }
}

/**
 * The frame the curtain lifted, in the video's own clock.
 *
 * The curtain is continuous from frame 0, but the encoder occasionally emits a
 * single non-black frame inside it (seen at 0.40s in several en takes), which
 * splits blackdetect's report into two segments. Taking the FIRST black_end
 * then trims from inside the curtain and yields a clip that is entirely black.
 * So: merge segments separated by a blip, and use the end of the run that
 * covers the start of the video.
 */
function takeStart(src) {
  const out = ff(['-hide_banner', '-i', src, '-vf', 'blackdetect=d=0.05:pix_th=0.05', '-an', '-f', 'null', '-'])
  const segs = [...out.matchAll(/black_start:([0-9.]+) black_end:([0-9.]+)/g)].map((m) => ({
    start: parseFloat(m[1]),
    end: parseFloat(m[2]),
  }))
  if (!segs.length) return null
  segs.sort((a, b) => a.start - b.start)
  // Only a run that begins at the very top of the file can be the curtain.
  if (segs[0].start > 0.3) return null
  let end = segs[0].end
  const BLIP = 0.25
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].start - end <= BLIP) end = segs[i].end
    else break
  }
  return end
}

const VF = (w, h) =>
  `fps=${FPS},scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
  // Near-black pad, not pure black, so a padded clip can never be mistaken for
  // a clapper by a downstream blackdetect.
  `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x0F1115,setsar=1,format=yuv420p`

for (const loc of LOCALES) {
  const manifestPath = OUT.manifest(loc)
  if (!existsSync(manifestPath)) {
    console.log(`skip ${loc}: no manifest`)
    continue
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  mkdirSync(OUT.clips(loc), { recursive: true })
  mkdirSync(`video-assets/clips-native/${loc}`, { recursive: true })

  const rows = []
  for (const shot of manifest.shots) {
    if (ONLY.length && !ONLY.includes(shot.id)) continue
    const src = `${OUT.raw(loc)}/${shot.id}.webm`
    if (!existsSync(src)) {
      console.log(`✗ ${shot.id}: no raw file`)
      continue
    }
    const start = takeStart(src)
    if (start == null) {
      console.log(`✗ ${shot.id}: no curtain lift found — take unusable`)
      continue
    }
    const nominalMs = NOMINAL[shot.id] ?? shot.nominalMs
    const dur = nominalMs / 1000
    const base = `${shot.index}-${shot.id}`

    // Padded 1920x1080 master variant.
    ff(['-y', '-hide_banner', '-i', src, '-ss', String(start), '-t', String(dur),
        '-vf', VF(1920, 1080), '-fps_mode', 'cfr', '-r', String(FPS),
        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0',
        `${OUT.clips(loc)}/${base}.mov`])

    // Unpadded native variant, for compositing phone shots into a device frame.
    ff(['-y', '-hide_banner', '-i', src, '-ss', String(start), '-t', String(dur),
        '-vf', `fps=${FPS},setsar=1,format=yuv420p`, '-fps_mode', 'cfr', '-r', String(FPS),
        '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0',
        `video-assets/clips-native/${loc}/${base}.mov`])

    const frames = Math.round((nominalMs * FPS) / 1000)
    if (start + dur > avail(src) + 0.05) {
      console.log(`  ! ${shot.id}: trim runs past the end of the take — widen tailPadMs and re-shoot`)
    }
    rows.push({ ...shot, nominalMs, takeStartSec: start, frames })
    console.log(`✓ ${base}  start=${start.toFixed(2)}s  ${frames}f`)
  }

  // Edit order at 30fps — lay these end to end and you have the rough cut.
  const tc = (f) => {
    const t = Math.floor(f / FPS)
    const ff2 = f % FPS
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:${String(ff2).padStart(2, '0')}`
  }
  let acc = 0
  const csv = ['index,shot_id,beat,frames,tc_in,tc_out,dir,viewport']
  for (const r of rows) {
    const inF = acc
    acc += r.frames
    csv.push(`${r.index},${r.shot_id ?? r.id},${r.beat},${r.frames},${tc(inF)},${tc(acc)},${r.dir},${r.viewport}`)
  }
  writeFileSync(`video-assets/edit-order-${loc}.csv`, csv.join('\n'))
  // A separate file — never clobber the capture manifest, which is the only
  // record of what was actually shot.
  writeFileSync(`video-assets/clips-${loc}.json`, JSON.stringify({ locale: loc, clips: rows }, null, 2))
  console.log(`${loc}: ${rows.length} clip(s), ${acc} frames total (${(acc / FPS).toFixed(1)}s)`)
}
