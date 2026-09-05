/**
 * Environment variable validation.
 * Per /docs/decisions.md #21 and /docs/security.md § Environment validation.
 *
 * Called once at server startup via next.config.ts.
 * Fails fast with named errors so the cause is immediately obvious.
 * Skipped in test environments (NODE_ENV=test).
 *
 * Do not add client-side logic here — this module is server-only.
 */

/**
 * Required in every environment (dev, staging, prod).
 * The app cannot start without these.
 */
const ALWAYS_REQUIRED: string[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BOOKING_JWT_SECRET',
  // Sprint 13: parent portal session cookies
  'PORTAL_JWT_SECRET',
  // Sprint 18: superadmin read-only support mode cookie signing
  'SUPPORT_SESSION_SECRET',
  // Sprint 23: Sumit SaaS platform billing credentials
  'SUMIT_COMPANY_ID',
  'SUMIT_API_KEY',
  // Public base URL — used for booking links, payment callbacks, calendar URLs.
  // Without it, external redirects break in production.
  'NEXT_PUBLIC_APP_URL',
]

/**
 * Required in production only.
 * In dev these may be absent — the webhook falls back to a skip with a warning.
 * In production, a missing value is a misconfiguration that must be caught before serving traffic.
 */
const REQUIRED_IN_PRODUCTION: string[] = [
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  // Sprint 7: per-org WhatsApp credential encryption
  'WHATSAPP_TOKEN_ENCRYPTION_KEY',
  // Sprint 7: Meta Embedded Signup OAuth flow
  'META_APP_ID',
  'META_APP_SECRET',
  // Sprint 31: Meta Embedded Signup Configuration ID (FB.login config_id)
  'NEXT_PUBLIC_META_CONFIG_ID',
  // Two-step verification PIN used to register a connected number on Cloud API.
  // Platform-level: orgs never see it, and re-registering a number needs it back.
  'WHATSAPP_REGISTER_PIN',
  // Sprint 8: per-org payment provider credential encryption
  'PAYMENT_CONFIG_ENCRYPTION_KEY',
  // Sprint 22: HMAC secret for Sumit SaaS billing webhook signature verification
  'SUMIT_WEBHOOK_SECRET',
  // Sprint 25: per-org AI provider credential encryption
  'AI_CONFIG_ENCRYPTION_KEY',
  // SaaS onboarding: stub vs Sumit-hosted paid checkout UI
  'NEXT_PUBLIC_ONBOARDING_PAID_CHECKOUT',
  // Sprint 28: per-org Gmail OAuth for outbound email
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GMAIL_TOKEN_ENCRYPTION_KEY',
  // Sprint 29: Google Calendar conflict detection
  'GOOGLE_CALENDAR_ENCRYPTION_KEY',
  // SHA-256 of the bearer token pg_cron sends to /api/internal/saas/*. Without
  // it the renewal cron cannot authenticate and no subscription is ever charged
  // — a silent revenue outage, so it fails the build instead.
  'LESSIO_SAAS_CRON_SECRET_SHA256',
  // Same, for /api/internal/lessons/auto-complete. This digest used to be
  // hardcoded in the route as a fallback, which pinned the credential to git
  // history; the route now reads it only from here, so a missing value must
  // stop the build rather than leave lessons silently never auto-completing.
  'LESSIO_AUTO_COMPLETION_CRON_SECRET_SHA256',
  // OPENAI_API_KEY: optional platform-level fallback. Each org configures its own AI key.
  // RESEND_API_KEY / RESEND_FROM_EMAIL: optional. Required only when email reminders are used.
  // NEXT_PUBLIC_SENTRY_DSN: optional. Set to enable Sentry error monitoring.
  // TRACKING_CONFIG_ENCRYPTION_KEY: optional. Required only to store a
  //   server-side tracking credential (Meta CAPI token, GA4 api_secret).
  //   Browser pixels work without it; /admin/tracking reports the miss.
]

/**
 * Secrets used to sign tokens, and the minimum length each must reach.
 *
 * Presence alone is not enough for a signing key: a short `PORTAL_JWT_SECRET`
 * still signs a valid 7-day parent-portal session, and HS256 over a low-entropy
 * secret is brute-forceable offline. The encryption keys already enforce their
 * own 64-hex-character floor inside src/lib/crypto; these had no floor at all.
 * 32 characters is the usual advice for an HMAC secret.
 */
const MIN_SECRET_LENGTH = 32
const LENGTH_CHECKED_SECRETS: string[] = [
  'BOOKING_JWT_SECRET',
  'PORTAL_JWT_SECRET',
  'SUPPORT_SESSION_SECRET',
]

/**
 * Validates required environment variables and throws a named error if any are missing.
 * Call this once at server startup.
 */
export function validateEnv(): void {
  // Skip validation in test environments — test runners set their own mocks.
  if (process.env.NODE_ENV === 'test') return

  const missing: string[] = []

  for (const key of ALWAYS_REQUIRED) {
    if (!process.env[key]) missing.push(key)
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) missing.push(key)
    }
  }

  if (missing.length > 0) {
    const list = missing.map(k => `  - ${k}`).join('\n')
    throw new Error(
      `[env] Missing required environment variable${missing.length > 1 ? 's' : ''}:\n` +
      `${list}\n\n` +
      `See .env.local.example for setup instructions.`
    )
  }

  // Only reached once every required secret is present.
  const tooShort = LENGTH_CHECKED_SECRETS.filter((key) => {
    const value = process.env[key]
    return value !== undefined && value.length < MIN_SECRET_LENGTH
  })

  if (tooShort.length > 0) {
    const list = tooShort
      .map(k => `  - ${k} (${process.env[k]?.length} characters)`)
      .join('\n')
    throw new Error(
      `[env] Signing secret${tooShort.length > 1 ? 's' : ''} shorter than ` +
      `${MIN_SECRET_LENGTH} characters:\n${list}\n\n` +
      `Generate one with: openssl rand -hex 32`
    )
  }
}
