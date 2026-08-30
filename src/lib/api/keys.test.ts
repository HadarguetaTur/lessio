import { describe, it, expect } from 'vitest'
import {
  mintApiKey,
  hashApiKey,
  extractApiKey,
  digestsMatch,
  isApiScope,
  API_SCOPES,
} from './keys'

describe('mintApiKey', () => {
  it('mints a key with the lsk_live_ prefix and 32 bytes of entropy', () => {
    const { plaintext } = mintApiKey()
    expect(plaintext.startsWith('lsk_live_')).toBe(true)
    // 32 bytes base64url-encodes to 43 characters with no padding.
    expect(plaintext).toHaveLength('lsk_live_'.length + 43)
  })

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 200 }, () => mintApiKey().plaintext))
    expect(keys.size).toBe(200)
  })

  it('returns the digest of the plaintext, not the plaintext', () => {
    const { plaintext, hash } = mintApiKey()
    expect(hash).toBe(hashApiKey(plaintext))
    expect(hash).not.toContain(plaintext)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('takes the display prefix from the head of the key', () => {
    const { plaintext, prefix } = mintApiKey()
    expect(prefix).toHaveLength(12)
    expect(plaintext.startsWith(prefix)).toBe(true)
  })
})

describe('hashApiKey', () => {
  it('is deterministic', () => {
    expect(hashApiKey('lsk_live_abc')).toBe(hashApiKey('lsk_live_abc'))
  })

  it('separates keys that differ by one character', () => {
    expect(hashApiKey('lsk_live_abc')).not.toBe(hashApiKey('lsk_live_abd'))
  })
})

describe('extractApiKey', () => {
  const valid = mintApiKey().plaintext

  it('reads a Bearer header', () => {
    expect(extractApiKey(`Bearer ${valid}`)).toBe(valid)
  })

  it('accepts the scheme in any case, and extra whitespace', () => {
    expect(extractApiKey(`bearer   ${valid}  `)).toBe(valid)
    expect(extractApiKey(`BEARER ${valid}`)).toBe(valid)
  })

  it('accepts a bare key, which is what a hand-filled Make header usually holds', () => {
    expect(extractApiKey(valid)).toBe(valid)
  })

  it('rejects a missing header', () => {
    expect(extractApiKey(null)).toBeNull()
    expect(extractApiKey('')).toBeNull()
  })

  it('rejects anything not shaped like one of our keys', () => {
    expect(extractApiKey('Bearer sk_live_something')).toBeNull()
    expect(extractApiKey('Bearer lsk_live_tooshort')).toBeNull()
    expect(extractApiKey(`Bearer ${valid}extra`)).toBeNull()
    // A Supabase JWT pasted into the wrong field.
    expect(extractApiKey('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def')).toBeNull()
  })
})

describe('digestsMatch', () => {
  it('matches identical digests', () => {
    const h = hashApiKey('x')
    expect(digestsMatch(h, h)).toBe(true)
  })

  it('rejects different digests, and different lengths without throwing', () => {
    expect(digestsMatch(hashApiKey('a'), hashApiKey('b'))).toBe(false)
    expect(digestsMatch(hashApiKey('a'), 'short')).toBe(false)
  })
})

describe('isApiScope', () => {
  it('accepts every declared scope', () => {
    for (const scope of API_SCOPES) expect(isApiScope(scope)).toBe(true)
  })

  it('rejects anything else, so a forged form field cannot widen a key', () => {
    expect(isApiScope('admin')).toBe(false)
    expect(isApiScope('*')).toBe(false)
    expect(isApiScope('')).toBe(false)
  })
})
