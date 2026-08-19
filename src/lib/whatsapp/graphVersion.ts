/**
 * The one Graph API version every Meta call in the app targets.
 *
 * Meta retires a version about two years after release. An unversioned or
 * retired-version call does not fail loudly — it silently resolves to the
 * oldest version still live, so behaviour drifts without any error. Pinning the
 * version in one place is what keeps that from happening per call site.
 *
 * v25.0 is the version Meta's current Embedded Signup implementation guide
 * documents:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/
 *
 * Mirrored in supabase/functions/_shared/whatsapp.ts, which runs on Deno and
 * cannot import from src/. Bump both together.
 */
export const META_API_VERSION = 'v25.0'
