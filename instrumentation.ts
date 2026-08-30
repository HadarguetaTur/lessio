export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * Keeps a serverless function alive until a background promise settles.
 *
 * WHY: on Vercel the container is frozen the moment the response finishes, and
 * every dashboard band renders inside its own Suspense boundary — so a band
 * that throws does it *after* the shell has already streamed out. The insert
 * below then starts a network round trip against a function that is about to
 * stop executing, and the row never lands. That is the likeliest reason the
 * feed held six client-side reports of one /dashboard failure and not a single
 * server-side row carrying its message — the same self-test writes the row
 * every time under `next dev` and under a local production build.
 *
 * The runtime exposes the hook on a global symbol (this is what `after()` uses
 * underneath). Off Vercel — `next dev`, `next start`, tests — nothing is
 * registered and the plain await below is already enough.
 */
function getWaitUntil(): ((promise: Promise<unknown>) => void) | undefined {
  const scope = globalThis as Record<symbol, unknown>
  for (const key of ['@next/request-context', '@vercel/request-context']) {
    const holder = scope[Symbol.for(key)] as
      | { get?: () => { waitUntil?: (promise: Promise<unknown>) => void } | undefined }
      | undefined
    const waitUntil = holder?.get?.()?.waitUntil
    if (typeof waitUntil === 'function') return waitUntil
  }
  return undefined
}

/**
 * Next calls this for every server-side request error.
 *
 * It is the single highest-coverage hook we have — it sees failures from
 * pages, route handlers and Server Actions alike — so the error feed that
 * recurring-bug detection reads is populated here rather than by instrumenting
 * call sites one at a time.
 *
 * Sentry keeps its own copy: it holds breadcrumbs and source-mapped stacks that
 * a Postgres row does not.
 */
export const onRequestError = async (
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
) => {
  const [thrown, request, context] = args

  // Node only: the telemetry writer pulls in the Supabase client, which is not
  // available in the edge runtime. Edge failures still reach Sentry below.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const [{ reportError, describeThrown }] = await Promise.all([
        import('./src/lib/telemetry/reportError'),
      ])
      const described = describeThrown(thrown)

      const written = reportError({
        ...described,
        route: context?.routePath ?? request?.path ?? null,
        source: 'server',
        url: request?.path ?? null,
        userAgent: headerValue(request?.headers, 'user-agent'),
      })

      // Register before awaiting: the await alone does not stop the platform
      // from freezing the function once the response has been sent.
      getWaitUntil()?.(written)
      await written
    } catch (err) {
      // Telemetry must never mask the error it is reporting.
      console.error('[instrumentation] Failed to record error event', { err: String(err) })
    }
  }

  const { captureRequestError } = await import('@sentry/nextjs')
  return captureRequestError(...args)
}

/** Next's request headers here are a plain object, not a Headers instance. */
function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | null {
  const raw = headers?.[name]
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw ?? null
}
