-- Performance indexes for the queries every dashboard render runs.
--
-- The existing lessons index leads with (organization_id, teacher_id, start_at):
-- Postgres cannot skip the middle column, so every org-wide range query on
-- start_at (today's lessons, the week view, the money KPIs) degraded to a scan
-- of the org's whole lesson history. Same shape on charges, whose only useful
-- index leads with parent_id.
--
-- Plain CREATE INDEX (not CONCURRENTLY): the Supabase migration runner wraps
-- each file in a transaction. These tables are small enough that the write
-- lock lasts well under a second.

-- Calendar views, today's lessons, dashboard revenue KPIs.
CREATE INDEX IF NOT EXISTS idx_lessons_org_start
  ON public.lessons (organization_id, start_at);

-- Forecast (scheduled lessons ahead) and any status + date range filter.
CREATE INDEX IF NOT EXISTS idx_lessons_org_status_start
  ON public.lessons (organization_id, status, start_at);

-- "Unlogged lessons" attention query: status = 'scheduled' AND end_at < now().
CREATE INDEX IF NOT EXISTS idx_lessons_org_status_end
  ON public.lessons (organization_id, status, end_at);

-- Dashboard summary and debtors: org + status IN (...), no parent filter.
CREATE INDEX IF NOT EXISTS idx_charges_org_status
  ON public.charges (organization_id, status);

-- Forecast: paid lesson charges in the last 30 days.
CREATE INDEX IF NOT EXISTS idx_charges_org_status_type_paid
  ON public.charges (organization_id, status, charge_type, paid_at);

-- Conversation list: org + created_at window, ordered newest first.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_created
  ON public.whatsapp_messages (organization_id, created_at DESC);

-- Students page: org + is_active, ordered by name.
CREATE INDEX IF NOT EXISTS idx_students_org_active_name
  ON public.students (organization_id, is_active, full_name);

-- Parents page: org, ordered by name.
CREATE INDEX IF NOT EXISTS idx_parents_org_name
  ON public.parents (organization_id, full_name);

-- Dashboard "overdue homework" badge; the existing partial index only covers
-- status = 'pending'.
CREATE INDEX IF NOT EXISTS idx_homework_assignments_org_status_created
  ON public.homework_assignments (organization_id, status, created_at DESC);

-- Forecast: cancellation events in a date window.
CREATE INDEX IF NOT EXISTS idx_cancel_events_org_created
  ON public.student_cancellation_events (organization_id, created_at);

-- Forecast: active (non-paused) subscriptions.
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_paused
  ON public.subscriptions (organization_id, is_paused);
