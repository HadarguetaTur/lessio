import { describe, expect, it } from 'vitest'

import { APPROVED_TEMPLATES } from './approvedTemplates'
import { TEMPLATES } from './registerTemplates'
import { DEFAULT_TEMPLATES } from './templates'

describe('approved templates registry consistency', () => {
  it('registers every approved template with Meta on WABA connection', () => {
    const registeredNames = new Set(TEMPLATES.map((t) => t.name))

    for (const [type, approved] of Object.entries(APPROVED_TEMPLATES)) {
      expect(registeredNames.has(approved.name), `${type} → ${approved.name} missing from registerTemplates`).toBe(true)
    }
  })

  it('maps every approved template type to a known MessageTemplateType', () => {
    for (const type of Object.keys(APPROVED_TEMPLATES)) {
      expect(DEFAULT_TEMPLATES).toHaveProperty(type)
    }
  })

  it('covers all 16 message template types with defaults', () => {
    expect(Object.keys(DEFAULT_TEMPLATES)).toHaveLength(16)
  })
})
