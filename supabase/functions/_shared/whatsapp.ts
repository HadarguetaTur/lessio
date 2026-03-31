/**
 * Minimal WhatsApp Cloud API client for Supabase Edge Functions.
 * Mirrors the relevant parts of src/lib/whatsapp/index.ts but uses
 * the Deno fetch API (no Node.js required).
 */

const META_API_VERSION = 'v19.0'

/**
 * Sends a plain-text WhatsApp message.
 * Throws on non-2xx response.
 */
export async function sendTextMessage(
  to: string,
  text: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`WhatsApp API error ${res.status}: ${detail}`)
  }
}
