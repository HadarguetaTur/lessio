import type { NextConfig } from "next";
import { validateEnv } from "./src/lib/env";

// Validate required environment variables at startup.
// Fails fast with a named error if any required var is missing.
// Per /docs/decisions.md #21 — startup env validation.
validateEnv();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1'],
};

export default nextConfig;
