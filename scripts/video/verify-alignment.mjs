/**
 * Proves that one edit works for both languages.
 *
 *   node scripts/video/verify-alignment.mjs
 *
 * Loads both clip manifests and asserts, index by index, that the shot ids match
 * and the frame counts are identical. Exits non-zero on the first mismatch,
 * naming the shot. A green run is the guarantee that the Hebrew and English
 * timelines are interchangeable.
 */

import { existsSync, readFileSync } from 'node:fs'

const load = (loc) => {
  const p = `video-assets/clips-${loc}.json`
  if (!existsSync(p)) {
    console.error(`missing ${p} — run postprocess for "${loc}" first`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(p, 'utf8')).clips
}

const he = load('he')
const en = load('en')
const problems = []

if (he.length !== en.length) {
  problems.push(`clip count differs: he=${he.length} en=${en.length}`)
}

for (let i = 0; i < Math.min(he.length, en.length); i++) {
  if (he[i].id !== en[i].id) {
    problems.push(`#${i + 1}: id differs — he="${he[i].id}" en="${en[i].id}"`)
    continue
  }
  if (he[i].frames !== en[i].frames) {
    problems.push(`${he[i].id}: frames differ — he=${he[i].frames} en=${en[i].frames}`)
  }
}

const total = (a) => a.reduce((n, c) => n + c.frames, 0)

if (problems.length) {
  console.error('✗ timelines are NOT aligned:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

console.log(`✓ ${he.length} clips aligned — ${total(he)} frames (${(total(he) / 30).toFixed(1)}s) in both locales`)
