import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadMedia, MediaTooLargeError, MAX_MEDIA_DOWNLOAD_BYTES } from './media'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  fetchMock.mockReset()
})

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }
}

describe('downloadMedia', () => {
  it('resolves the media URL and returns the bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ url: 'https://cdn.example/x', mime_type: 'image/jpeg', file_size: 3 })
      )
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(bytes) })

    const result = await downloadMedia('media-1', 'token')

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.buffer.length).toBe(3)
    // Both requests carry the bearer token.
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as { headers: Record<string, string> }).headers.Authorization).toBe(
        'Bearer token'
      )
    }
  })

  it('rejects on the declared size before downloading', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        url: 'https://cdn.example/x',
        mime_type: 'application/pdf',
        file_size: MAX_MEDIA_DOWNLOAD_BYTES + 1,
      })
    )

    await expect(downloadMedia('media-1', 'token')).rejects.toThrow(MediaTooLargeError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws on a failed lookup', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, false, 404))

    await expect(downloadMedia('media-1', 'token')).rejects.toThrow('Media lookup failed')
  })
})
