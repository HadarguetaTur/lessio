import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards against the two i18n regressions that shipped raw keys to production
 * (UX audit 25.08, findings F02/F30):
 *  1. he.json / en.json drifting apart structurally.
 *  2. A `t('…')` call referencing a key that does not exist under the
 *     translator's namespace — including the double-namespace mistake
 *     (`getTranslations('lessons')` + `t('lessons.detailTitle')`).
 *
 * The scan is static and intentionally conservative: dynamic keys (template
 * literals, variables) are skipped.
 */

const ROOT = path.resolve(__dirname, '../../..')

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'))
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listSourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('messages structure', () => {
  it('he.json and en.json expose exactly the same keys', () => {
    const he = new Set(flattenKeys(loadMessages('he')))
    const en = new Set(flattenKeys(loadMessages('en')))
    const onlyHe = [...he].filter((k) => !en.has(k))
    const onlyEn = [...en].filter((k) => !he.has(k))
    expect(onlyHe, 'keys missing from en.json').toEqual([])
    expect(onlyEn, 'keys missing from he.json').toEqual([])
  })
})

describe('translation call sites', () => {
  const allKeys = new Set(flattenKeys(loadMessages('en')))
  // Namespace prefixes that exist (a namespaced translator is valid when at
  // least one key lives under it).
  const namespaces = new Set<string>()
  for (const key of allKeys) {
    const parts = key.split('.')
    for (let i = 1; i < parts.length; i++) namespaces.add(parts.slice(0, i).join('.'))
  }

  const files = listSourceFiles(path.join(ROOT, 'src'))

  // varName -> namespace ('' = root) per file
  const TRANSLATOR_DECL =
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g
  const GET_T_DECL = /(?:const|let)\s+(\w+)\s*=\s*await\s+getT\(\s*(?:'([^']*)'|"([^"]*)"|undefined)\s*(?:,[^)]*)?\)/g

  it('every literal t(<key>) call resolves to an existing message key', () => {
    const problems: string[] = []

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      // A file can declare the same translator name several times (one per
      // server action) with different scopes — attribute each call to the
      // nearest preceding declaration of that name.
      const decls: { name: string; ns: string; index: number }[] = []
      for (const m of src.matchAll(TRANSLATOR_DECL)) {
        decls.push({ name: m[1], ns: m[2] ?? m[3] ?? '', index: m.index ?? 0 })
      }
      for (const m of src.matchAll(GET_T_DECL)) {
        decls.push({ name: m[1], ns: m[2] ?? m[3] ?? '', index: m.index ?? 0 })
      }
      if (decls.length === 0) continue
      decls.sort((a, b) => a.index - b.index)
      const names = new Set(decls.map((d) => d.name))

      for (const varName of names) {
        const varDecls = decls.filter((d) => d.name === varName)
        // varName('literal'  — skip template literals / variables (dynamic keys)
        const callRe = new RegExp(`(?<![\\w.])${varName}\\(\\s*'([^']+)'`, 'g')
        for (const call of src.matchAll(callRe)) {
          const key = call[1]
          const callIndex = call.index ?? 0
          const decl =
            [...varDecls].reverse().find((d) => d.index <= callIndex) ?? varDecls[0]
          const full = decl.ns ? `${decl.ns}.${key}` : key
          if (!allKeys.has(full) && !namespaces.has(full)) {
            problems.push(`${path.relative(ROOT, file)}: ${varName}('${key}') → missing '${full}'`)
          }
        }
      }
    }

    expect(problems, problems.join('\n')).toEqual([])
  })
})
