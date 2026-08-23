/**
 * The one Graph API version every Meta call in the app targets.
 *
 * Meta retires a version about two years after release. An unversioned or
 * retired-version call does not fail loudly — it silently resolves to the
 * oldest version still live, so behaviour drifts without any error. Pinning the
 * version in one place is what keeps that from happening per call site.
 *
 * This is the *Graph API* version (v26.0, released 2026-07-29). It is not the
 * Embedded Signup version — that is fixed by the Facebook Login for Business
 * configuration (v4), never by a parameter in code. The Embedded Signup guide:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/
 *
 * Mirrored in supabase/functions/_shared/whatsapp.ts, which runs on Deno and
 * cannot import from src/. Bump both together.
 */
export const META_API_VERSION = 'v26.0'
