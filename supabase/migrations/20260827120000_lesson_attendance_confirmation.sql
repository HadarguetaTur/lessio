-- Attendance confirmation from the lesson-reminder button.
--
-- The reminder template now carries a "confirm attendance" quick reply; a tap
-- lands on the webhook, which stamps the lesson here. Nullable by design:
-- every lesson predating this, and every reminder nobody answers, simply has
-- no confirmation — that is not the same as a decline, and there is no third
-- state to record. Declining is a cancellation, which the flow already handles.

alter table lessons
  add column attendance_confirmed_at timestamptz,
  add column attendance_confirmed_by text
    check (attendance_confirmed_by in ('parent', 'student'));

comment on column lessons.attendance_confirmed_at is
  'When a parent or student tapped "confirm attendance" on the lesson reminder. Null = never answered.';
comment on column lessons.attendance_confirmed_by is
  'Which capacity confirmed — the reminder goes to a phone, which may belong to either.';
