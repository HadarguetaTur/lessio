-- Per-student lesson activity, aggregated in the database.
--
-- The students report (and through it the dashboard's "at risk" band) used to
-- pull every non-cancelled lesson the organization ever had, with its
-- lesson_students rows, into Node just to derive two numbers per student.
-- This function returns exactly those numbers: the all-time last lesson (the
-- report deliberately shows the real date even for a lapsed student) and the
-- count since a cutoff.
--
-- Called with the service-role client, so no RLS grant is needed beyond the
-- default; kept STABLE so the planner may inline it.
CREATE OR REPLACE FUNCTION public.student_lesson_activity(p_org_id uuid, p_since timestamptz)
RETURNS TABLE (student_id uuid, last_lesson_at timestamptz, lessons_since bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    ls.student_id,
    MAX(l.start_at) AS last_lesson_at,
    COUNT(*) FILTER (WHERE l.start_at >= p_since) AS lessons_since
  FROM public.lessons l
  JOIN public.lesson_students ls ON ls.lesson_id = l.id
  WHERE l.organization_id = p_org_id
    AND l.status <> 'cancelled'
  GROUP BY ls.student_id
$$;
