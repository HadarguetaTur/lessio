-- Sprint 3: Add hourly_rate to teachers table (Decision #11)
-- amount = hourly_rate * (duration_minutes / 60)
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);
