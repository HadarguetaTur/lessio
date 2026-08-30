/**
 * Locale-resolved selectors.
 *
 * The codebase has zero data-testid (verified), so every selector is text — and
 * every text differs between he and en. Shots therefore declare i18n KEYS and
 * the runner resolves them against messages/<loc>.json. A missing or drifted
 * key throws at shot-list load, before Chromium starts, instead of quietly
 * producing a wrong take.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cache = {}

function messages(loc) {
  if (!cache[loc]) {
    cache[loc] = JSON.parse(readFileSync(resolve(process.cwd(), `messages/${loc}.json`), 'utf8'))
  }
  return cache[loc]
}

export function makeT(loc) {
  const m = messages(loc)
  return (key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), m)
    if (typeof v !== 'string') throw new Error(`i18n: missing key "${key}" in ${loc}`)
    return v
  }
}

/**
 * byKey(page, 'nav.students')            → role-less text match
 * byKey(page, 'billing.approve', 'button')
 */
export function makeByKey(loc) {
  const t = makeT(loc)
  return (page, key, role) => {
    const name = t(key)
    return role
      ? page.getByRole(role, { name, exact: false }).first()
      : page.getByText(name, { exact: false }).first()
  }
}
