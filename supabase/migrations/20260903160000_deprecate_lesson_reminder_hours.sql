-- ── organizations.lesson_reminder_hours is deprecated ────────────────────────
--
-- Sprint 31 moved ownership of the lesson-reminder timing to
-- automation_lesson_reminder_hours (/settings/whatsapp → Automations), but the
-- older control on /settings/reminders was left standing and kept writing here.
-- Because automation_lesson_reminder_hours is NOT NULL DEFAULT 24, the
-- coalesce in supabase/functions/lesson-reminders could never fall through to
-- this column: every value an owner saved on the reminders page — and every
-- value the onboarding wizard collected — had no effect on when a reminder was
-- sent. UX audit 7 (docs/ux-audit-7-communications.md, F1) found it live.
--
-- The writers are gone as of this migration's companion change. The column
-- itself is kept for one release so a rollback of the app code still finds it
-- populated; dropping it is a separate migration once no deployed build reads
-- or writes it.
--
-- Nothing in this file changes data or constraints. It is documentation the
-- next person will actually see, in the place they will look.

COMMENT ON COLUMN organizations.lesson_reminder_hours IS
  'DEPRECATED (2026-09-03) — not read by any sender. The lesson-reminder timing '
  'is organizations.automation_lesson_reminder_hours, owned by /settings/whatsapp. '
  'Retained for one release to keep a code rollback safe; drop in a later migration. '
  'Note the CHECK here allows (2,4,12,24,48) while the live column allows (2,12,24) — '
  'another reason the two were never interchangeable.';
