/**
 * Refuses to run an ops script against a Supabase project it was not told to touch.
 *
 * Why: every script in scripts/ falls back to .env.local for its service-role
 * key, and for months .env.local pointed at production. A typo in an org id or
 * a script run out of habit was one keystroke away from live customer data.
 * The video and center-demo scripts already had a per-script opt-in
 * (VIDEO_DEMO_ALLOW_REMOTE / CENTER_DEMO_ALLOW_REMOTE); this is the same idea,
 * shared, with production requiring two deliberate signals instead of one.
 *
 * Allowed targets, in order:
 *   1. the local stack (127.0.0.1 / localhost / host.docker.internal)
 *   2. the project ref named in LESSIO_DEV_SUPABASE_REF (the shared dev/preview
 *      project — set it in .env.local, it is not a secret)
 *   3. anything else ONLY with LESSIO_TARGET=production AND --i-know-this-is-prod
 *
 * Call it right after loadEnvLocal(); it reads NEXT_PUBLIC_SUPABASE_URL itself
 * and returns silently when the URL is unset so the script's own "missing env"
 * message still wins.
 */

const LOCAL_HOST = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:|\/|$)/
const PROD_FLAG = '--i-know-this-is-prod'

function projectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function assertSafeTarget(url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): void {
  if (!url) return

  if (LOCAL_HOST.test(url)) return

  const ref = projectRef(url)
  const devRef = process.env.LESSIO_DEV_SUPABASE_REF
  if (ref && devRef && ref === devRef) return

  const prodIntended =
    process.env.LESSIO_TARGET === 'production' && process.argv.includes(PROD_FLAG)

  if (prodIntended) {
    console.error(
      `⚠  PRODUCTION target: ${new URL(url).host}\n` +
        '   LESSIO_TARGET=production and --i-know-this-is-prod were both given.\n'
    )
    return
  }

  console.error(
    `✗ Refusing to touch a non-local, non-dev Supabase: ${url}\n` +
      '  Allowed without ceremony: the local stack, or the project named in\n' +
      '  LESSIO_DEV_SUPABASE_REF. For production you must mean it twice:\n' +
      `    LESSIO_TARGET=production npx tsx <script> ${PROD_FLAG}\n` +
      '  and run it from the ops session, not from an agent checkout\n' +
      '  (docs/ops/agent-policy.md).'
  )
  process.exit(1)
}
