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
  // Holiday names are he/en data pairs persisted to organization_holidays by
  // the org's default_locale — not UI strings. Deno mirror alongside.
  "src/lib/holidays/hebrewHolidays.ts",
  "supabase/functions/_shared/hebrewHolidays.ts",
  // Deno mirror of src/lib/whatsapp/submitTemplate.ts — VAR_FALLBACKS carries a
  // full he/en pair, same as the Node original.
  "supabase/functions/_shared/whatsapp.ts",
  // Language pickers: each option is written in the language it selects, which
  // is correct in both locales.
  "src/components/dashboard/LocaleSwitcher.tsx",
  "src/components/i18n/LocaleToggle.tsx",
  "src/components/marketing/LandingLocaleToggle.tsx",
  "src/app/(dashboard)/settings/locale/page.tsx",
  "src/app/(dashboard)/settings/message-templates/page.tsx",
  // The system prompt is sent to the model, never shown to a user, and the
  // model is instructed to reply in the customer's language.
  "src/lib/ai-assistant/buildSystemPrompt.ts",
  "src/lib/ai-assistant/copilot.ts",
  // The Hebrew half of each legal document. Each has an English sibling
  // (TermsEn / PrivacyEn) and page.tsx picks by locale, mirroring how the
  // marketing copy is split.
  "src/app/terms/TermsHe.tsx",
  "src/app/privacy/PrivacyHe.tsx",
  // Registered company name and postal address — not translated.
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  // Statically generated at build time, so it cannot vary per request — one
  // image is served to every locale. Making it language-neutral is a marketing
  // decision, not a technical one.
  "src/app/opengraph-image.tsx",
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
  // Hebrew skip-words the exam-report bot flow must keep accepting ("דלג") —
  // input-side, not output; the prompts themselves live in botString().
  "src/lib/exam-report-flow/parseExamDate.ts",
  // Search synonyms only — never rendered. Each entry deliberately holds the
  // Hebrew *and* English aliases at once, because the title half of the match
  // only ever sees the active UI language: without them, typing "reminder" in
  // a Hebrew UI finds nothing. Splitting them per locale would defeat that.
  // Every user-visible label in this file is a translation key, not a string.
  "src/lib/navigation/registry.ts",
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
      "no-restricted-syntax": ["error", ...noHardcodedHebrew],
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
