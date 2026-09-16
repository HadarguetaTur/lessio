import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

export type ResearchResponse = { status: number; text: string; location: string | null; contentType: string }

/** Resolve once and pin the public address, preventing DNS rebinding. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23]/i.test(address) && !/^2001:db8:/i.test(address)
  if (isIP(address) !== 4) return false
  const [a, b] = address.split('.').map(Number) as [number, number, number, number]
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0))
}

export function businessHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) return null
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (!host.includes('.') || isIP(host) || host.endsWith('.local') || host.endsWith('.internal')) return null
    return host
  } catch { return null }
}

export async function fetchResearchPage(url: string): Promise<ResearchResponse> {
  if (!businessHost(url)) throw new Error('UNSAFE_URL')
  const parsed = new URL(url)
  const addresses = await lookup(parsed.hostname, { all: true })
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new Error('UNSAFE_ADDRESS')
  const pinned = addresses[0]!
  return new Promise((resolve, reject) => {
    const req = (parsed.protocol === 'https:' ? httpsRequest : httpRequest)(parsed, {
      method: 'GET',
      headers: { 'User-Agent': 'LessioResearch/1.0 (+https://www.getlessio.com)', Accept: 'text/html,text/plain' },
      signal: AbortSignal.timeout(8_000),
      family: pinned.family,
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (res) => {
      const status = res.statusCode ?? 0
      const contentType = String(res.headers['content-type'] ?? '')
      const location = res.headers.location ?? null
      if (status >= 300 && status < 400) {
        res.resume()
        resolve({ status, text: '', location, contentType })
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      const max = parsed.pathname === '/robots.txt' ? 512_000 : 250_000
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > max) { req.destroy(new Error('PAGE_TOO_LARGE')); return }
        chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('end', () => resolve({ status, text: Buffer.concat(chunks).toString('utf8'), location, contentType }))
    })
    req.on('error', reject)
    req.end()
  })
}
