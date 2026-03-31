/**
 * AES-256-GCM decryption for Deno Edge Functions.
 *
 * Mirrors the format produced by src/lib/crypto/index.ts (Node.js):
 *   base64(iv):base64(ciphertext):base64(authTag)
 *
 * Uses the Web Crypto API (SubtleCrypto) — available natively in Deno.
 * Node.js `crypto` module is NOT available in Supabase Edge Functions.
 */

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('[crypto] Hex string has odd length')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/**
 * Decrypts a value encrypted with encryptWithKey() / encryptToken() from the
 * Node.js crypto utility.
 *
 * @param encrypted  Colon-delimited base64 string: iv:ciphertext:authTag
 * @param keyHex     64-character hex key (32 bytes, AES-256)
 */
export async function decryptWithKey(
  encrypted: string,
  keyHex: string
): Promise<string> {
  if (keyHex.length !== 64) {
    throw new Error('[crypto] Encryption key must be a 64-character hex string')
  }

  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('[crypto] Invalid encrypted format — expected iv:ciphertext:authTag')
  }

  const [ivB64, ctB64, tagB64] = parts
  const iv         = base64ToBytes(ivB64)
  const ciphertext = base64ToBytes(ctB64)
  const tag        = base64ToBytes(tagB64)

  // SubtleCrypto AES-GCM expects ciphertext + authTag concatenated
  const ctWithTag = new Uint8Array(ciphertext.length + tag.length)
  ctWithTag.set(ciphertext)
  ctWithTag.set(tag, ciphertext.length)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    cryptoKey,
    ctWithTag
  )

  return new TextDecoder().decode(plaintext)
}

/**
 * Decrypts a WhatsApp access token using WHATSAPP_TOKEN_ENCRYPTION_KEY.
 */
export async function decryptToken(encrypted: string): Promise<string> {
  const keyHex = Deno.env.get('WHATSAPP_TOKEN_ENCRYPTION_KEY')
  if (!keyHex) {
    throw new Error('[crypto] WHATSAPP_TOKEN_ENCRYPTION_KEY is not set')
  }
  return decryptWithKey(encrypted, keyHex)
}
