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
  // OPENAI_API_KEY: optional platform-level fallback. Each org configures its own AI key.
  // RESEND_API_KEY / RESEND_FROM_EMAIL: optional. Required only when email reminders are used.
  // NEXT_PUBLIC_SENTRY_DSN: optional. Set to enable Sentry error monitoring.
  // TRACKING_CONFIG_ENCRYPTION_KEY: optional. Required only to store a
  //   server-side tracking credential (Meta CAPI token, GA4 api_secret).
  //   Browser pixels work without it; /admin/tracking reports the miss.
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
}
