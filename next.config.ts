import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { validateEnv } from "./src/lib/env";
import createNextIntlPlugin from "next-intl/plugin";

// Validate required environment variables at startup.
// Fails fast with a named error if any required var is missing.
// Per /docs/decisions.md #21 — startup env validation.
validateEnv();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  experimental: {
    serverActions: {
      bodySizeLimit: '11mb', // Homework media uploads: max 10MB file + form fields overhead
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  // Sprint 23 Story 2b: /he/portal/:path* internally serves /portal/:path* without
  // restructuring files. The proxy adds a 301 from /portal/:orgId → /he/portal/:orgId
  // so new parents land at the locale-prefixed URL while existing links still work.
  async redirects() {
    return [
      // Canonical URL aliases — common paths Meta and external tools check
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
      { source: '/terms-of-service', destination: '/terms', permanent: true },
      { source: '/tos', destination: '/terms', permanent: true },
      { source: '/data-deletion-instructions', destination: '/data-deletion', permanent: true },
      { source: '/user-data-deletion', destination: '/data-deletion', permanent: true },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/he/portal/:path*',
        destination: '/portal/:path*',
      },
    ]
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Suppress source map upload warnings when SENTRY_AUTH_TOKEN is not set (local dev).
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Upload source maps for better stack traces in production.
  widenClientFileUpload: true,
  // Disable Sentry telemetry.
  telemetry: false,
});
