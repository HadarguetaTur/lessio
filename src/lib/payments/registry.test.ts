import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getRegistryEntry, getRegisteredProviderIds } from './registry'
import { PROVIDERS_UI, getProviderUI } from './registry-ui'
import heCatalog from '../../../messages/he.json'
import enCatalog from '../../../messages/en.json'

interface ProviderCopy {
  label: string
  fields?: Record<string, unknown>
}

/**
 * The generated literal type of an imported JSON module does not fit an index
 * signature, so the catalogs are narrowed once here rather than cast at each
 * use site.
 */
function providerCopy(catalog: unknown): Record<string, ProviderCopy | undefined> {
  return (catalog as { settings: { paymentProviders: Record<string, ProviderCopy> } }).settings
    .paymentProviders
}

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * The provider slugs the database will actually accept, read from the most
 * recent migration that redefines organizations_payment_provider_check.
 */
function constraintProviderIds(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let latest: string | null = null
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const match = sql.match(
      /ADD CONSTRAINT\s+organizations_payment_provider_check\s+CHECK\s*\(\s*payment_provider\s+IN\s*\(([^)]*)\)/i
    )
    if (match) latest = match[1]!
  }

  if (latest === null) {
    throw new Error('No migration defines organizations_payment_provider_check')
  }

  return [...latest.matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

describe('payment provider registry', () => {
  const ids = getRegisteredProviderIds()

  it('accepts every registered provider in the database CHECK constraint', () => {
    // The bug this exists for: Stripe shipped an adapter with no migration, so
    // the constraint never learned the slug and saving a Stripe configuration
    // failed at the last step. See the note in the Grow migration.
    const allowed = constraintProviderIds()
    const missing = ids.filter((id) => !allowed.includes(id))

    expect(missing, 'provider ids with no matching CHECK constraint entry').toEqual([])
  })

  it('has UI metadata for every registered provider, and vice versa', () => {
    expect(ids.filter((id) => !getProviderUI(id))).toEqual([])
    expect(PROVIDERS_UI.map((p) => p.id).filter((id) => !getRegistryEntry(id))).toEqual([])
  })

  it('has catalog copy for every provider in both languages', () => {
    // A missing block renders the raw key path on the settings screen.
    for (const [name, catalog] of [
      ['he', heCatalog],
      ['en', enCatalog],
    ] as const) {
      const providers = providerCopy(catalog)
      for (const id of ids) {
        expect(
          providers[id],
          `${name}.json is missing settings.paymentProviders.${id}`
        ).toBeDefined()
      }
    }
  })

  it('has a field entry for every field the form will render', () => {
    const providers = providerCopy(heCatalog)

    for (const provider of PROVIDERS_UI) {
      for (const field of provider.fields) {
        expect(
          providers[provider.id]?.fields?.[field.name],
          `he.json is missing settings.paymentProviders.${provider.id}.fields.${field.name}`
        ).toBeDefined()
      }
    }
  })
})

describe('make entry', () => {
  const entry = getRegistryEntry('make')!

  it('is registered', () => {
    expect(entry).toBeDefined()
  })

  it('accepts a webhook URL', () => {
    const result = entry.validateConfig({ webhookUrl: 'https://hook.eu2.make.com/abc123' })
    expect(result).toEqual({
      success: true,
      config: { webhookUrl: 'https://hook.eu2.make.com/abc123' },
    })
  })

  it('rejects a value that is not a URL, with a catalog key rather than prose', () => {
    const result = entry.validateConfig({ webhookUrl: 'not-a-url' })
    expect(result.success).toBe(false)
    expect(result.success === false && result.errorKey).toBe('validation.webhookUrlInvalid')
  })

  it('rejects a missing webhook URL', () => {
    expect(entry.validateConfig({}).success).toBe(false)
    expect(entry.validateConfig({ webhookUrl: '' }).success).toBe(false)
  })

  it('carries no verifyWebhookRequest — the API key path authenticates instead', () => {
    expect(entry.verifyWebhookRequest).toBeUndefined()
  })

  it('is last in the UI list, so it does not become the default selection', () => {
    expect(PROVIDERS_UI[0]?.id).not.toBe('make')
  })
})
