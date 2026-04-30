-- Sprint 5 stabilization:
-- 1. Prevent duplicate cancellation charges per lesson.
-- 2. Harden teacher lesson updates beyond RLS by enforcing allowed fields/statuses.

CREATE UNIQUE INDEX IF NOT EXISTS charges_cancellation_lesson_id_unique
  ON charges(lesson_id)
  WHERE charge_type = 'cancellation';

CREATE OR REPLACE FUNCTION public.guard_teacher_lesson_update()
RETURNS trigger AS $$
DECLARE
  app_role text := coalesce(auth.jwt() ->> 'app_role', auth.jwt() ->> 'role', '');
BEGIN
  IF app_role <> 'teacher' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'לא ניתן לשנות סטטוס של שיעור שבוטל';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.start_at IS DISTINCT FROM OLD.start_at
     OR NEW.end_at IS DISTINCT FROM OLD.end_at THEN
    RAISE EXCEPTION 'מורה יכול לעדכן רק את תוצאת השיעור שלו';
  END IF;

  IF NEW.status NOT IN ('completed', 'no_show') THEN
    RAISE EXCEPTION 'מורה יכול לעדכן שיעור רק להושלם או לא הגיע';
  END IF;

  IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
    RAISE EXCEPTION 'מורה אינו יכול לעדכן סיבת ביטול';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_teacher_lesson_update ON lessons;
CREATE TRIGGER guard_teacher_lesson_update
  BEFORE UPDATE ON lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_teacher_lesson_update();
