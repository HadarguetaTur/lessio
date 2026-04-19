import type { NextConfig } from "next";
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
  // Sprint 23 Story 2b: /he/portal/:path* internally serves /portal/:path* without
  // restructuring files. The proxy adds a 301 from /portal/:orgId → /he/portal/:orgId
  // so new parents land at the locale-prefixed URL while existing links still work.
  async rewrites() {
    return [
      {
        source: '/he/portal/:path*',
        destination: '/portal/:path*',
      },
    ]
  },
};

export default withNextIntl(nextConfig);
