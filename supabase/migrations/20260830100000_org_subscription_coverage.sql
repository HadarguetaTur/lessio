-- Billing policy: which lesson types an active subscription covers.
-- Attendance in a covered type is NOT charged per-lesson while the student
-- has an active (unpaused, date-overlapping) subscription.
-- Default matches the previous hardcoded behavior: pair/group/custom covered,
-- individual always billed on top of the subscription.

ALTER TABLE organizations
  ADD COLUMN subscription_covered_lesson_types text[] NOT NULL
    DEFAULT ARRAY['pair', 'group', 'custom']
    CONSTRAINT organizations_sub_covered_types_check
    CHECK (subscription_covered_lesson_types <@ ARRAY['individual', 'pair', 'group', 'custom']::text[]);

COMMENT ON COLUMN organizations.subscription_covered_lesson_types IS
  'Lesson types whose attendance an active subscription covers (no per-lesson charge). Edited at /settings/billing-policy.';
