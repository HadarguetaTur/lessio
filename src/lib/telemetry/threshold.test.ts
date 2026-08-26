import { describe, it, expect } from 'vitest'
import { crossesThreshold } from './threshold'

describe('crossesThreshold()', () => {
  it('promotes a fingerprint that repeats enough inside one org', () => {
    expect(crossesThreshold({ eventCount: 5, orgCount: 1 })).toBe(true)
    expect(crossesThreshold({ eventCount: 50, orgCount: 1 })).toBe(true)
  })

  it('holds back a one-off, and a handful of retries by one person', () => {
    expect(crossesThreshold({ eventCount: 1, orgCount: 1 })).toBe(false)
    expect(crossesThreshold({ eventCount: 4, orgCount: 1 })).toBe(false)
  })

  it('promotes earlier when several orgs are hit — blast radius beats volume', () => {
    expect(crossesThreshold({ eventCount: 3, orgCount: 2 })).toBe(true)
  })

  it('still needs a repeat even across orgs', () => {
    expect(crossesThreshold({ eventCount: 2, orgCount: 2 })).toBe(false)
  })

  it('ignores events with no org attached for the multi-org bar', () => {
    // orgCount 0 happens for logged-out pages and webhooks.
    expect(crossesThreshold({ eventCount: 3, orgCount: 0 })).toBe(false)
    expect(crossesThreshold({ eventCount: 5, orgCount: 0 })).toBe(true)
  })
})
