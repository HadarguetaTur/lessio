const PRODUCTION_SECRET_KEY_NAME = 'lessio_vercel_production'
const CRON_SECRET_KEY_NAME = 'lessio_edge_cron'

function getHostedSecretKey(name: string): string | null {
  const hostedKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (!hostedKeysJson) return null

  const hostedKeys = JSON.parse(hostedKeysJson) as Record<string, string>
  return hostedKeys[name] ?? null
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

/**
 * Use the named, independently revocable Supabase secret key in hosted Edge
 * Functions. Local Supabase still exposes only the legacy development variable.
 */
export function getSupabaseSecretKey(): string {
  const productionKey = getHostedSecretKey(PRODUCTION_SECRET_KEY_NAME)
  if (productionKey) {
    return productionKey
  }

  if (Deno.env.get('SUPABASE_SECRET_KEYS')) {
    throw new Error(
      `Missing Supabase secret key named ${PRODUCTION_SECRET_KEY_NAME}`
    )
  }

  const localDevelopmentKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!localDevelopmentKey) {
    throw new Error('Missing Supabase secret key')
  }

  return localDevelopmentKey
}

/** Authenticate scheduled invocations without the deprecated JWT gateway. */
export function authorizeCronRequest(request: Request): Response | null {
  const expectedKey = getHostedSecretKey(CRON_SECRET_KEY_NAME)
  if (!expectedKey) {
    console.error(`Missing Supabase secret key named ${CRON_SECRET_KEY_NAME}`)
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const suppliedKey = request.headers.get('apikey') ?? ''
  if (!constantTimeEqual(suppliedKey, expectedKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return null
}
