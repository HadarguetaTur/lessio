-- ── Bilingual WhatsApp bot ──────────────────────────────────────────────────
-- The bot replied in Hebrew unconditionally. These columns let it resolve a
-- recipient language and let orgs customise templates per language.

-- Nullable on purpose: NULL means "not detected yet" and falls back to the
-- org default. The webhook fills it in from the script of the first inbound
-- message it sees from this parent.
ALTER TABLE parents
  ADD COLUMN preferred_locale text
    CHECK (preferred_locale IN ('he', 'en'));

-- Fallback for parents whose language is still unknown (proactive reminders
-- sent before the parent has ever written to us).
ALTER TABLE organizations
  ADD COLUMN default_locale text NOT NULL DEFAULT 'he'
    CHECK (default_locale IN ('he', 'en'));

-- Custom templates become per-language. Existing rows are Hebrew.
ALTER TABLE message_templates
  ADD COLUMN locale text NOT NULL DEFAULT 'he'
    CHECK (locale IN ('he', 'en'));

-- The old uniqueness (organization_id, type) would collapse the two languages
-- onto one row. Postgres names table-level UNIQUE constraints
-- <table>_<columns>_key.
ALTER TABLE message_templates
  DROP CONSTRAINT message_templates_organization_id_type_key;

ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_organization_id_type_locale_key
    UNIQUE (organization_id, type, locale);
