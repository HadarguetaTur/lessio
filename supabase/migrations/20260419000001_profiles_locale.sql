-- Sprint 21: add preferred_locale to profiles
ALTER TABLE profiles
  ADD COLUMN preferred_locale text NOT NULL DEFAULT 'he'
    CHECK (preferred_locale IN ('he', 'en'));
