import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Blocks hardcoded Hebrew in source.
 *
 * `src/i18n/request.ts` loads one catalog per request with no cross-locale
 * fallback, so a Hebrew literal in source renders verbatim to an English user.
 * Every user-visible string must go through `t()` / `getTranslations()` /
 * `getT()` (lib code) / `botString()` (WhatsApp).
 *
 * The range is written as `֐-׿` escapes rather than literal Hebrew so
 * this config does not trip its own rule. Matching is on the *parsed* value, so
 * `\uXXXX`-escaped Hebrew — how the PDF renderers write every label — is caught
 * too. `JSXText` is listed separately because bare text between JSX tags is not
 * a `Literal` node.
 */
const HEBREW_RANGE = "[\\u0590-\\u05FF]";
const HEBREW_MESSAGE =
  "Hardcoded Hebrew. Move this string to messages/he.json + messages/en.json and read it via useTranslations/getTranslations (components & actions), getT() (lib code), or botString() (WhatsApp).";

const noHardcodedHebrew = [
  `Literal[value=/${HEBREW_RANGE}/]`,
  `TemplateElement[value.cooked=/${HEBREW_RANGE}/]`,
  `JSXText[value=/${HEBREW_RANGE}/]`,
].map((selector) => ({ selector, message: HEBREW_MESSAGE }));

/**
 * Files where Hebrew is correct and must stay.
 * Keep this list tight — every entry is a place the guard cannot protect.
 */
const HEBREW_ALLOWED = [
  // Bilingual by their own system (he/en records + botString/resolveTemplate).
  "src/lib/whatsapp/**",
  "supabase/functions/_shared/templates.ts",
  "supabase/functions/_shared/botStrings.ts",
  // Deno mirror of src/lib/whatsapp/submitTemplate.ts — VAR_FALLBACKS carries a
  // full he/en pair, same as the Node original.
  "supabase/functions/_shared/whatsapp.ts",
  // Bilingual via getLandingContent(locale).
  "src/lib/marketing/landingCopy.ts",
  // Bilingual he/en branches already. Listed file-by-file, not by directory —
  // their siblings (payment-request/autoSend.ts, cancellation-flow/
  // executeCancellation.ts) do still leak Hebrew and must stay covered.
  "src/lib/email/templates/**",
  "src/lib/payment-request/index.ts",
  "src/lib/cancellation-flow/index.ts",
  // Hebrew column headers and enum values the importer must keep *accepting*
  // from real customer spreadsheets — input-side, not output.
  "src/lib/import/parseFile.ts",
  "src/lib/import/validators.ts",
  // The locale machinery itself (Hebrew-letter detection ranges).
  "src/lib/i18n/**",
  "src/i18n/**",
  // Hebrew fixtures and assertions.
  "**/*.test.ts",
  "**/*.test.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/**/*.{ts,tsx}", "supabase/functions/**/*.ts"],
    rules: {
      // TODO: flip to "error" once the count reaches zero (Phase 5).
      "no-restricted-syntax": ["warn", ...noHardcodedHebrew],
    },
  },
  {
    files: HEBREW_ALLOWED,
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
