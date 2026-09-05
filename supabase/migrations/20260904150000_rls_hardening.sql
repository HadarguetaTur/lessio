-- Migration: 20260904150000_rls_hardening.sql
--
-- Follow-up to the security audit of 2026-09-04. Four independent fixes, all on
-- the RLS surface. Three are defence in depth and one repairs a live defect.
--
-- Context that explains why three of these are invisible to the application:
-- almost every query in this codebase runs on the service-role client, which
-- bypasses RLS entirely. There is no RLS-client read of organizations, of the
-- homework tables, or of whatsapp_messages anywhere in src/. RLS is therefore
-- not what protects those tables from the app — the .eq('organization_id', ...)
-- in application code is. What RLS still governs is (a) a hand-rolled PostgREST
-- call carrying a legitimate user's JWT, and (b) Realtime delivery, which runs
-- as the browser's anon client under that user's token. Both are real: an
-- authenticated teacher can curl PostgREST directly.
--
--   1. organizations  — take the credential columns away from the browser key.
--   2. homework_*     — the policies had no role predicate at all.
--   3. whatsapp_*     — teachers could read the whole org's transcript.
--   4. in_app_notifications — a restrictive deny left over from an earlier
--                       migration silently voids the notification bell's
--                       realtime subscription.


-- ── 1. organizations: credential columns off the browser key ─────────────────
--
-- organizations_teacher_read / _admin_read grant SELECT on the whole row, and
-- the row holds seven encrypted credentials: whatsapp_token,
-- whatsapp_access_token, payment_config_encrypted, receipt_config_encrypted,
-- ai_config_encrypted, gmail_refresh_token, google_calendar_refresh_token.
-- Ciphertext is not plaintext, but a teacher being able to exfiltrate every
-- tenant secret blob is not a boundary worth keeping, and Postgres has no
-- column-level RLS to express "this row but not that column".
--
-- The fix is a table-level revoke, and a column-level one would have been
-- silently useless: anon and authenticated hold a *table-level* SELECT on
-- organizations (Supabase's default grant), which already covers every column,
-- present and future. `REVOKE SELECT (col, ...)` only removes column-specific
-- grants — none were ever issued — so the secrets stay readable and the
-- migration looks like it worked. Confirmed against the database before
-- settling on the statement below.
--
-- Taking SELECT away wholesale is safe because nothing reads this table through
-- a client that grants or RLS apply to. Each of the five files that imports the
-- RLS client alongside a `from('organizations')` uses createServiceRoleClient()
-- for that particular query ((dashboard)/layout.tsx, (dashboard)/parents/
-- actions.ts, both onboarding pages, lib/availability-overrides/index.ts), and
-- organizations is in neither WATCHED_TABLES nor the supabase_realtime
-- publication, so no browser subscription depends on it either.
--
-- A future RLS-client read of this table now fails closed and loudly. The fix
-- would be the service-role client (the established pattern for organizations)
-- or an explicit column grant covering only the non-secret columns.
--
-- teachers.google_calendar_refresh_token is deliberately left alone: teachers
-- *is* read through the RLS client, so it needs its call sites audited first.
REVOKE SELECT ON organizations FROM authenticated, anon;


-- ── 2. homework_templates / homework_assignments: give the policies a role ────
--
-- Both tables shipped with a single `FOR ALL` policy whose only test was "is
-- the caller a member of this organization". Any org member — including a
-- teacher — therefore had INSERT/UPDATE/DELETE over every template and every
-- assignment in the org, for any student, via PostgREST.
--
-- Deliberate choice, not a straight tightening: teachers legitimately create
-- homework (assignHomeworkAction admits owner, admin and teacher), so an
-- owner/admin-only write predicate would describe a product that does not
-- exist. The policies below are teacher-inclusive and teacher-scoped instead:
--   templates   — org-wide read (they are a shared library), write your own.
--   assignments — read and write the ones belonging to your own teacher record.
-- The app is unaffected either way; this makes the policy describe reality.

DROP POLICY IF EXISTS "org members can manage homework templates" ON homework_templates;

DROP POLICY IF EXISTS homework_templates_owner_admin_all ON homework_templates;
CREATE POLICY homework_templates_owner_admin_all
  ON homework_templates
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() IN ('owner', 'admin'))
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS homework_templates_teacher_read ON homework_templates;
CREATE POLICY homework_templates_teacher_read
  ON homework_templates
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid
         AND public.app_role() = 'teacher');

DROP POLICY IF EXISTS homework_templates_teacher_write ON homework_templates;
CREATE POLICY homework_templates_teacher_write
  ON homework_templates
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() = 'teacher'
              AND created_by = auth.uid())
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() = 'teacher'
              AND created_by = auth.uid());

COMMENT ON POLICY homework_templates_teacher_read ON homework_templates IS
  'Templates are a shared per-org library, so teachers read all of them but may only modify the ones they created (homework_templates_teacher_write).';

DROP POLICY IF EXISTS "org members can manage homework assignments" ON homework_assignments;

DROP POLICY IF EXISTS homework_assignments_owner_admin_all ON homework_assignments;
CREATE POLICY homework_assignments_owner_admin_all
  ON homework_assignments
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() IN ('owner', 'admin'))
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS homework_assignments_teacher_own ON homework_assignments;
CREATE POLICY homework_assignments_teacher_own
  ON homework_assignments
  FOR ALL
  USING      (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() = 'teacher'
              AND teacher_id = public.get_my_teacher_id())
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid
              AND public.app_role() = 'teacher'
              AND teacher_id = public.get_my_teacher_id());

COMMENT ON POLICY homework_assignments_teacher_own ON homework_assignments IS
  'A teacher reaches only their own assignments. The previous policy let any org member write an assignment for any student in the org.';


-- ── 3. whatsapp_messages / whatsapp_takeovers: scope the teacher read ────────
--
-- 20260903130000 granted owner, admin and teacher an identical org-wide SELECT,
-- documented as intentional. For teachers it means every parent's conversation
-- with the business — balances, cancellations, private messages about other
-- people's children — is readable with a teacher's own JWT.
--
-- 20260820000003 set the rule for changing this: "If teachers should only reach
-- their own students' threads, that is a change to the page query first and this
-- policy second." For WhatsApp the page query is already scoped — see
-- phonesReachableByTeacher() in src/lib/whatsapp/conversations.ts, which the
-- predicate below mirrors — so the precondition is met and narrowing the policy
-- makes the two agree instead of diverging.
--
-- These tables key a conversation by E.164 phone, not by student_id, so the
-- reachable set is a set of phone numbers: parents of students either assigned
-- to this teacher or taught by them through a lesson. Owner and admin keep the
-- org-wide read. Runtime effect is limited to Realtime delivery, since the
-- pages themselves read through the service-role client: a teacher stops
-- receiving live pokes for threads the page would never have shown them.
--
-- The set is computed by a SECURITY DEFINER function rather than inlined as a
-- subquery in the policy, and that is load-bearing. A subquery inside a policy
-- is evaluated as the querying user, so it is itself filtered by the RLS on
-- parents, relationships and students. Inlined, this predicate returned the
-- empty set and hid every thread — the policy's meaning would have depended on
-- three other tables' policies agreeing with it. get_my_teacher_id() is
-- SECURITY DEFINER for the same reason.

CREATE OR REPLACE FUNCTION public.phones_reachable_by_teacher()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.phone
    FROM parents p
    JOIN relationships r ON r.parent_id = p.id
   WHERE r.organization_id = (auth.jwt() ->> 'org_id')::uuid
     AND r.student_id IN (
          SELECT s.id
            FROM students s
           WHERE s.organization_id = (auth.jwt() ->> 'org_id')::uuid
             AND s.teacher_id = public.get_my_teacher_id()
          UNION
          SELECT ls.student_id
            FROM lesson_students ls
            JOIN lessons l ON l.id = ls.lesson_id
           WHERE l.organization_id = (auth.jwt() ->> 'org_id')::uuid
             AND l.teacher_id = public.get_my_teacher_id()
     );
$$;

COMMENT ON FUNCTION public.phones_reachable_by_teacher() IS
  'Parent phone numbers the calling teacher may see conversations for, derived from their own JWT org claim and teacher record. Mirrors phonesReachableByTeacher() in src/lib/whatsapp/conversations.ts — keep the two in step. SECURITY DEFINER so the policy that calls it is not re-filtered by RLS on parents/relationships/students.';

-- Callable only by the roles that carry a tenant claim; it exposes nothing
-- beyond what the caller's own JWT already entitles them to.
REVOKE EXECUTE ON FUNCTION public.phones_reachable_by_teacher() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phones_reachable_by_teacher() TO authenticated;

DROP POLICY IF EXISTS whatsapp_messages_teacher_read ON whatsapp_messages;
CREATE POLICY whatsapp_messages_teacher_read
  ON whatsapp_messages
  FOR SELECT
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND public.app_role() = 'teacher'
    AND phone IN (SELECT public.phones_reachable_by_teacher())
  );

DROP POLICY IF EXISTS whatsapp_takeovers_teacher_read ON whatsapp_takeovers;
CREATE POLICY whatsapp_takeovers_teacher_read
  ON whatsapp_takeovers
  FOR SELECT
  USING (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    AND public.app_role() = 'teacher'
    AND phone IN (SELECT public.phones_reachable_by_teacher())
  );

COMMENT ON POLICY whatsapp_messages_teacher_read ON whatsapp_messages IS
  'A teacher reads only conversations with parents of their own students; owner/admin keep the org-wide read. The reachable set comes from phones_reachable_by_teacher().';


-- ── 4. in_app_notifications: drop the deny that voids the bell ───────────────
--
-- deny_all_in_app_notifications (20260502000001) is RESTRICTIVE, and restrictive
-- policies are ANDed with the OR of the permissive ones — so it has been
-- silently voiding in_app_notifications_own_select ever since 20260820000002
-- added it "to let the bell update live". It was never dropped.
--
-- Nothing is broken in a way that errors: the bell's list, badge and both
-- mutations run on the service-role client and work. What fails is the Realtime
-- subscription in NotificationBell.tsx, which subscribes as the browser's anon
-- client under the user's JWT and so is filtered by RLS. It has been receiving
-- nothing, leaving the badge to update only on navigation or the 5-minute poll.
--
-- Dropping the deny activates own-row SELECT and nothing else: the permissive
-- policy is recipient_profile_id = auth.uid(), SELECT only, and no INSERT,
-- UPDATE or DELETE policy exists, so writes stay service-role-only.
--
-- Deliberately NOT done here: portal_messages has the identical dead-deny shape
-- and a Realtime consumer waiting on it, but its permissive policies grant
-- teachers an org-wide read of every family's private thread — the same privacy
-- boundary section 3 just tightened. It stays fail-closed pending a scoped
-- policy, on 20260820000003's rule: page query first, policy second.
DROP POLICY IF EXISTS deny_all_in_app_notifications ON in_app_notifications;
