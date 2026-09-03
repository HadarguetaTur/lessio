-- Migration: 20260903100000_student_pricing.sql
-- Per-student pricing: a personal hourly rate (individual lessons) and a
-- percentage discount applied to every lesson and cancellation fee.
--
-- Pricing chain for an individual lesson becomes
--   students.hourly_rate ?? teachers.hourly_rate ?? organizations.default_individual_hourly_rate
-- and the discount is applied last, on the resolved per-student amount.
-- Subscription fees and package prices are never discounted — they are prices
-- agreed per student already.

ALTER TABLE students
  ADD COLUMN hourly_rate      numeric(10,2),
  ADD COLUMN discount_percent numeric(5,2)
    CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  ADD COLUMN discount_reason  text;

COMMENT ON COLUMN students.hourly_rate IS
  'Personal hourly rate for individual lessons; overrides the teacher and org rates. NULL = inherit.';
COMMENT ON COLUMN students.discount_percent IS
  'Percentage taken off every lesson and cancellation fee for this student (sibling discount etc.). NULL = none.';
