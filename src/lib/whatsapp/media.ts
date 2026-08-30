/**
 * Inbound WhatsApp media download — Meta stores the file and hands the webhook
 * only a media id. Fetching is two steps: GET /{media-id} returns a short-lived
 * CDN URL (valid ~5 minutes), then that URL is fetched with the same bearer
 * token. https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */

import { META_API_VERSION } from './graphVersion'

export const MAX_MEDIA_DOWNLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export class MediaTooLargeError extends Error {
  constructor(public readonly fileSize: number) {
    super(`WhatsApp media too large: ${fileSize} bytes`)
    this.name = 'MediaTooLargeError'
  }
}

export async function downloadMedia(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!metaRes.ok) {
    throw new Error(`[whatsapp/media] Media lookup failed (${metaRes.status}): ${await metaRes.text()}`)
  }

  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number }
  if (!meta.url) throw new Error('[whatsapp/media] Media lookup returned no URL')

  // Reject on the declared size before pulling the bytes.
  if (typeof meta.file_size === 'number' && meta.file_size > MAX_MEDIA_DOWNLOAD_BYTES) {
    throw new MediaTooLargeError(meta.file_size)
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!fileRes.ok) {
    throw new Error(`[whatsapp/media] Media download failed (${fileRes.status})`)
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer())
  if (buffer.length > MAX_MEDIA_DOWNLOAD_BYTES) {
    throw new MediaTooLargeError(buffer.length)
  }

  return { buffer, mimeType: meta.mime_type ?? 'application/octet-stream' }
}
