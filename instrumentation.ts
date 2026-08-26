export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
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

      await reportError({
        ...described,
        route: context?.routePath ?? request?.path ?? null,
        source: 'server',
        url: request?.path ?? null,
        userAgent: headerValue(request?.headers, 'user-agent'),
      })
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
