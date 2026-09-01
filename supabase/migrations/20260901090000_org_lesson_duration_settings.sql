-- Configurable lesson durations and the booking surfaces on which each is available.
ALTER TABLE organizations
  ADD COLUMN lesson_duration_settings jsonb NOT NULL DEFAULT '[
    {"minutes":30,"bot":true,"teacher":true,"admin":true},
    {"minutes":45,"bot":true,"teacher":true,"admin":true},
    {"minutes":60,"bot":true,"teacher":true,"admin":true},
    {"minutes":90,"bot":true,"teacher":true,"admin":true}
  ]'::jsonb;

COMMENT ON COLUMN organizations.lesson_duration_settings IS
  'Ordered lesson durations (5-480 minutes) and availability for bot, teacher, and admin booking surfaces.';
