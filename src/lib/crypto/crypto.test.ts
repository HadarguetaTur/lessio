/**
 * AES-256-GCM envelope.
 *
 * Untested until the security audit of 2026-09-04, despite guarding every
 * per-org credential in the product. Two properties matter beyond the obvious
 * round-trip: tampering must be detected (that is the whole point of GCM over a
 * bare cipher), and the wire format must stay byte-compatible with the Deno
 * mirror in supabase/functions/_shared/crypto.ts — a silent divergence there
 * breaks every scheduled reminder, because those functions decrypt the same
 * columns this module writes.
 */

import { describe, expect, it } from 'vitest'

import {
  encryptWithKey,
  decryptWithKey,
  encryptSaasPaymentToken,
  decryptSaasPaymentToken,
} from './index'

const KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)

describe('encryptWithKey / decryptWithKey', () => {
  it('round-trips, including Hebrew and emoji', () => {
    for (const plaintext of ['tok_live_123', 'שלום עולם', '🔐 secret', '']) {
      expect(decryptWithKey(encryptWithKey(plaintext, KEY), KEY)).toBe(plaintext)
    }
  })

  it('produces the iv:ciphertext:authTag envelope the Deno mirror expects', () => {
    const parts = encryptWithKey('x', KEY).split(':')
    expect(parts).toHaveLength(3)

    const [iv, , tag] = parts
    // 12-byte IV and 16-byte tag, base64-encoded. supabase/functions/_shared/
    // crypto.ts decodes on exactly these lengths.
    expect(Buffer.from(iv, 'base64')).toHaveLength(12)
    expect(Buffer.from(tag, 'base64')).toHaveLength(16)
  })

  it('never repeats a ciphertext for the same input, because the IV is random', () => {
    const a = encryptWithKey('same', KEY)
    const b = encryptWithKey('same', KEY)
    expect(a).not.toBe(b)
    expect(decryptWithKey(a, KEY)).toBe(decryptWithKey(b, KEY))
  })

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    const [iv, ct, tag] = encryptWithKey('tok_live_123', KEY).split(':')
    // Flip a byte in the ciphertext, keeping the envelope well-formed.
    const bytes = Buffer.from(ct, 'base64')
    bytes[0] ^= 0xff
    const tampered = [iv, bytes.toString('base64'), tag].join(':')

    expect(() => decryptWithKey(tampered, KEY)).toThrow()
  })

  it('rejects a swapped auth tag', () => {
    const [iv, ct] = encryptWithKey('one', KEY).split(':')
    const otherTag = encryptWithKey('two', KEY).split(':')[2]

    expect(() => decryptWithKey([iv, ct, otherTag].join(':'), KEY)).toThrow()
  })

  it('rejects the wrong key', () => {
    expect(() => decryptWithKey(encryptWithKey('x', KEY), OTHER_KEY)).toThrow()
  })

  it('rejects a malformed envelope', () => {
    expect(() => decryptWithKey('not-encrypted', KEY)).toThrow(/expected iv:ciphertext:authTag/)
    expect(() => decryptWithKey('a:b', KEY)).toThrow(/expected iv:ciphertext:authTag/)
  })

  it('demands a 32-byte key in both directions', () => {
    expect(() => encryptWithKey('x', 'tooshort')).toThrow(/64-character hex/)
    expect(() => decryptWithKey(encryptWithKey('x', KEY), 'tooshort')).toThrow(/64-character hex/)
  })
})

describe('SaaS payment token wrappers', () => {
  it('round-trips through the payment key', () => {
    expect(decryptSaasPaymentToken(encryptSaasPaymentToken('tok_live_1'))).toBe('tok_live_1')
  })

  it('throws on an undecryptable value instead of yielding null', () => {
    // The renewal charger depends on this: chargeSumitCustomer omits
    // PaymentMethod for a falsy token, which silently charges whichever card
    // Sumit holds for the customer.
    expect(() => decryptSaasPaymentToken('plaintext-token')).toThrow()
  })
})
