-- Schedule exceptions gain partial-day blocks.
--
-- Until now an override could only say "this whole date is off" or "for this
-- date, these hours replace the weekly grid". There was no way to say "next
-- Tuesday morning is closed, the afternoon is normal" — you had to describe
-- what stayed open instead of what closed, and you could not close two
-- separate parts of one day.
--
-- Three row kinds now share the table, and several rows per date are legal:
--
--   is_available = false, times NULL  -> the whole day is blocked
--   is_available = false, times set   -> just that range is blocked   (new)
--   is_available = true,  times set   -> special hours replacing the weekly grid
--
-- Readers evaluate in two phases: the base windows (the special-hours rows for
-- the date, else the weekly grid), minus every blocked row.
--
-- DEPLOY ORDER: the application code must ship BEFORE this migration runs.
-- The day-off approval used to write these rows with
-- upsert(onConflict: 'teacher_id,override_date'), which stops working the
-- moment the constraint below is dropped — and that failure was only logged,
-- not thrown, so approvals would cancel lessons and message parents while
-- leaving the days bookable. The replacement writer is delete-then-insert,
-- which works with or without the constraint.

-- ── Repair before constraining ───────────────────────────────────────────────
-- Both statements are no-ops on rows the application wrote correctly, and both
-- are behaviour-preserving under the OLD reader as well as the new one, which
-- is what makes them safe against several orgs' live data.

-- A half-specified window has never meant anything: every reader tests
-- start_time AND end_time together and ignores the row otherwise.
UPDATE availability_overrides
   SET start_time = NULL, end_time = NULL
 WHERE (start_time IS NULL) <> (end_time IS NULL);

-- An inverted or zero-length window produced a date with no bookable slots at
-- all (the slot cursor exits immediately). A whole-day block is the row shape
-- that says exactly that, so say it that way.
UPDATE availability_overrides
   SET is_available = false, start_time = NULL, end_time = NULL
 WHERE start_time IS NOT NULL
   AND end_time IS NOT NULL
   AND start_time >= end_time;

-- ── Several rows per date ────────────────────────────────────────────────────

ALTER TABLE availability_overrides
  DROP CONSTRAINT IF EXISTS availability_overrides_teacher_id_override_date_key;

ALTER TABLE availability_overrides
  ADD CONSTRAINT availability_overrides_times_paired
    CHECK ((start_time IS NULL) = (end_time IS NULL)),
  ADD CONSTRAINT availability_overrides_end_after_start
    CHECK (start_time IS NULL OR start_time < end_time);

-- One whole-day block per date is still the only sensible reading, and keeping
-- it unique gives the create path a meaningful 23505 to translate rather than
-- silently stacking duplicates from a double-tapped approval. Safe by
-- construction: the constraint just dropped guaranteed at most one row per
-- (teacher_id, override_date), so there is nothing here to collide with.
CREATE UNIQUE INDEX availability_overrides_one_full_day_block
  ON availability_overrides (teacher_id, override_date)
  WHERE is_available = false AND start_time IS NULL;

-- idx_availability_overrides_teacher_date already covers the list reads that
-- replace the old single-row lookups, so no other index is needed.

COMMENT ON TABLE availability_overrides IS
  'Date-specific exceptions to the weekly availability grid. Several rows per teacher per date are legal. is_available=false with NULL times blocks the whole day; is_available=false with times blocks just that range; is_available=true with times replaces the weekly grid for that date. Readers take the base windows and subtract every blocked range.';
