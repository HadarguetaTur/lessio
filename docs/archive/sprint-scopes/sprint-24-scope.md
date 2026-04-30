# Sprint 24 — Pedagogical Depth
*Branch: `sprint-24`*
*Depends on: Sprint 23 complete*

---

## Carry-Over from Sprint 23

| Item | Reason |
|---|---|
| Sumit SaaS Billing E2E staging validation (manual checklist) | Not code — requires staging environment with real Sumit credentials. Deferred until staging is provisioned. |

---

## Closed Decisions (pre-sprint)

| Topic | Decision |
|---|---|
| File upload storage | **Supabase Storage** — `homework-attachments` bucket with org-scoped paths (`{org_id}/{assignment_id}/{filename}`). RLS on storage bucket. No external CDN yet. |
| Submission model | **One submission per student per assignment** — upsert semantics. Student can resubmit (overwrites previous). |
| Grading scale | **0–100 numeric score** — no custom rubrics in v1. Teacher can add freeform feedback text alongside score. |
| Scheduled send mechanism | **DB column `send_at`** on `homework_assignments` + Edge Function picks up unsent rows. No client-side timer. |
| Lesson notes visibility | **All notes visible to owner/admin**. Teacher sees only their own notes. `visible_to_parent` boolean for portal (Sprint 26). |
| Student profile tabs | **5 tabs**: Overview / Lessons / Homework / Billing / Notes. Each tab is a server component with independent data fetch. |
| Goals status model | **3 statuses**: `active` / `achieved` / `abandoned`. No partial-progress tracking in v1. |
| Notes format | **Plain text** — no Markdown in v1. Keeps rendering simple and avoids sanitization complexity. |

---

## Context: What Was Already Built

| Feature | Status |
|---|---|
| `homework_templates` + `homework_assignments` tables + CRUD | ✅ Done (Sprint 14) |
| Homework assign flow (select template → select students → send via WhatsApp) | ✅ Done (Sprint 14) |
| `supabase/functions/homework-reminders` — daily cron, overdue marking | ✅ Done (Sprint 14) |
| Student CRUD + student detail page | ✅ Done (Sprint 2) |
| Student groups + group membership | ✅ Done (Sprint 22) |
| Billing engine (`buildStudentMonth`, `syncMonthlyCharge`) | ✅ Done (Sprint 22) |
| Parent portal with OTP auth + home + payments | ✅ Done (Sprint 13) |
| Teacher lesson creation + calendar | ✅ Done (Sprint 13) |
| Lesson detail page with status updates | ✅ Done (Sprint 2) |
| i18n infrastructure (next-intl, `messages/he.json` + `messages/en.json`) | ✅ Done (Sprint 21) |

---

## Goal

Transform homework from simple WhatsApp text messages into a real assignment system with file attachments, student submissions, and teacher grading. Add structured lesson notes for teachers. Overhaul the student profile page from a flat detail card into a tabbed view with full history. Introduce learning goals to track student progress.

---

## Story 0 — Carry-Over: Sumit E2E Validation

**Not code** — manual validation checklist on staging:

- [ ] Plan selection in onboarding with Sumit test card
- [ ] `organization_subscriptions` row created with correct `status = 'active'`
- [ ] Sumit webhook fires → `sumit-saas` route updates subscription status
- [ ] `saas-subscription-checker` cron marks expired subscriptions as `past_due`
- [ ] `saas-renewal-reminder` Edge Function sends renewal WhatsApp 7 days before expiry
- [ ] Cancel flow via `/account/billing` sets `cancel_at_period_end = true`

---

## Story 1 — Homework v2: Attachments + Submissions + Grading

**Why:** Current homework is fire-and-forget text via WhatsApp. Teachers have no way to receive student work, grade it, or track completion rates.

### 1a — Homework Attachments (Teacher Side)

- DB: `homework_attachments` table (see Schema Changes)
- Supabase Storage: `homework-attachments` bucket, org-scoped paths
- `src/lib/homework/attachments.ts` — `uploadAttachment(assignmentId, orgId, file)`, `listAttachments(assignmentId)`, `deleteAttachment(attachmentId)`
- Assignment form (`src/app/(dashboard)/homework/assign/`): file upload zone (PDF, images, max 10MB per file, max 5 files)
- WhatsApp message includes attachment URLs (clickable links)

### 1b — Homework Submissions (Student/Parent Side)

- DB: `homework_submissions` table (see Schema Changes)
- Portal: new homework tab `/portal/[orgId]/homework` — lists active assignments with due date and status
- Submission form: text body + optional file upload (reuses Supabase Storage, `homework-submissions` bucket)
- Upsert semantics: resubmit overwrites previous submission
- `src/lib/homework/submissions.ts` — `submitHomework(assignmentId, studentId, body, attachmentUrl)`, `getSubmission(assignmentId, studentId)`, `getSubmissionsForAssignment(assignmentId)`

### 1c — Grading

- Teacher view: `/homework/[assignmentId]` — lists all students with submission status
- Per-submission: score (0–100) + freeform feedback text
- `src/lib/homework/grading.ts` — `gradeSubmission(submissionId, score, feedback)`
- After grading: WhatsApp notification to parent with score (via `sendSmartMessage`)
- Dashboard homework list: completion rate column per assignment

### 1d — Scheduled Sending

- `homework_assignments.send_at` column — nullable `timestamptz`
- Assignment form: "שלח עכשיו" / "תזמן שליחה" toggle with date+time picker
- `supabase/functions/homework-sender/index.ts` — hourly cron, picks up `send_at <= now() AND sent = false`, sends via WhatsApp
- Register in `supabase/config.toml`

---

## Story 2 — Lesson Notes

**Why:** Teachers have no structured place to record what happened in a lesson — topics covered, student struggles, next steps. This information is critical for continuity (substitute teachers) and parent communication (Sprint 26).

### 2a — Notes CRUD

- DB: `lesson_notes` table (see Schema Changes)
- `src/lib/lessons/notes.ts` — `createNote(lessonId, teacherId, body)`, `updateNote(noteId, body)`, `getNotesForLesson(lessonId)`, `getNotesForStudent(studentId)`
- RBAC: teacher can create/edit own notes only; owner/admin can read all notes

### 2b — Lesson Detail Integration

- `/lessons/[id]` page: "הערות שיעור" section below lesson details
- Teacher sees add/edit form for their own note + read-only list of other teachers' notes
- Owner/admin sees read-only list of all notes

### 2c — Teacher Quick Notes

- `/teacher/schedule` — after marking lesson as completed, prompt "הוסף הערה?" with inline text area
- Optional — teacher can skip and add later from lesson detail

---

## Story 3 — Student Profile Overhaul

**Why:** Current student detail page is a flat card showing basic info. As the system grows (homework, billing, notes), all student data needs a structured, navigable view.

### 3a — Tabbed Layout

- Redesign `/students/[id]` page with 5 tabs:
  - **Overview**: name, phone, parent(s), group membership, attendance rate (30/90 days), homework completion rate, outstanding balance, last lesson date
  - **Lessons**: full lesson history (date, teacher, status, duration, cancellation reason)
  - **Homework**: all assignments with status, score, submission link
  - **Billing**: per-student charges + payment history (reuses existing billing data)
  - **Notes**: teacher-written lesson notes (read-only for owner/admin, editable for originating teacher)
- Each tab is a server component with independent data fetch (no client-side tab switching fetches)
- URL-based tab selection: `/students/[id]?tab=lessons`

### 3b — Overview KPIs

- `src/lib/students/stats.ts` — `getStudentStats(studentId, orgId)`:
  - `attendanceRate30d` / `attendanceRate90d`: completed / (completed + cancelled + no_show)
  - `homeworkCompletionRate`: submitted / total assigned
  - `outstandingBalance`: sum of unpaid charges
  - `lastLessonDate`: most recent completed lesson
  - `totalLessons`: count of all lessons
  - `activeSince`: student `created_at`

---

## Story 4 — Learning Goals

**Why:** Tutoring businesses need to track what each student is working toward. Goals provide structure for parent communication and progress reporting.

### 4a — Goals CRUD

- DB: `student_goals` table (see Schema Changes)
- `src/lib/students/goals.ts` — `createGoal(studentId, orgId, data)`, `updateGoal(goalId, data)`, `listGoals(studentId)`, `updateGoalStatus(goalId, status)`
- RBAC: owner/admin/teacher can create/edit goals

### 4b — Goals UI

- Student profile → Overview tab: active goals summary (count + nearest target date)
- Student profile → new "Goals" section within Overview tab (not a separate tab)
- Goal card: subject, description, target date, status badge (active/achieved/abandoned)
- Add goal form: subject + description + optional target date
- Status transitions: active → achieved / active → abandoned (with confirmation)

### 4c — Portal Goals Display

- `/portal/[orgId]/home` — "יעדי הלמידה" section showing active goals for the parent's students
- Read-only — parents cannot edit goals

---

## Schema Changes

```sql
-- Story 1a: homework attachments
CREATE TABLE homework_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url             text NOT NULL,
  filename        text NOT NULL,
  size_bytes      int,
  uploaded_by     uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE homework_attachments ENABLE ROW LEVEL SECURITY;

-- Story 1b: homework submissions
CREATE TABLE homework_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body            text,
  attachment_url  text,
  score           int CHECK (score >= 0 AND score <= 100),
  feedback        text,
  graded_by       uuid REFERENCES profiles(id),
  graded_at       timestamptz,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;

-- Story 1d: scheduled sending
ALTER TABLE homework_assignments
  ADD COLUMN send_at timestamptz,
  ADD COLUMN sent    boolean NOT NULL DEFAULT true;
-- Existing assignments: sent = true (already sent)
-- New scheduled assignments: sent = false, send_at = future timestamp

-- Story 2: lesson notes
CREATE TABLE lesson_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lesson_notes ENABLE ROW LEVEL SECURITY;

-- Story 4: student goals
CREATE TABLE student_goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  description     text NOT NULL,
  target_date     date,
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'achieved', 'abandoned')),
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE student_goals ENABLE ROW LEVEL SECURITY;
```

**Migration file:** `supabase/migrations/20260501000001_sprint24_pedagogical_depth.sql`

**Supabase Storage buckets:**
- `homework-attachments` — teacher uploads (assignment files)
- `homework-submissions` — student/parent uploads (submitted work)

---

## New Dependencies

None — file upload uses Supabase Storage (already a dependency via `@supabase/supabase-js`).

---

## New Env Vars

None.

---

## Files to Create

| File | Story |
|---|---|
| `supabase/migrations/20260501000001_sprint24_pedagogical_depth.sql` | All |
| `src/lib/homework/attachments.ts` | 1a |
| `src/lib/homework/submissions.ts` | 1b |
| `src/lib/homework/grading.ts` | 1c |
| `supabase/functions/homework-sender/index.ts` | 1d |
| `src/lib/lessons/notes.ts` | 2a |
| `src/lib/students/stats.ts` | 3b |
| `src/lib/students/goals.ts` | 4a |
| `src/app/(dashboard)/homework/[assignmentId]/page.tsx` | 1c |
| `src/app/(dashboard)/homework/[assignmentId]/actions.ts` | 1c |
| `src/app/portal/[orgId]/homework/page.tsx` | 1b |
| `src/app/portal/[orgId]/homework/actions.ts` | 1b |

---

## Files to Modify

| File | Change |
|---|---|
| `src/app/(dashboard)/homework/assign/page.tsx` | Add file upload zone + scheduled send toggle |
| `src/app/(dashboard)/homework/assign/actions.ts` | Handle attachments + `send_at` / `sent` fields |
| `src/app/(dashboard)/homework/page.tsx` | Add completion rate column, link to assignment detail |
| `src/app/(dashboard)/lessons/[id]/page.tsx` | Add "הערות שיעור" section |
| `src/app/(dashboard)/teacher/schedule/page.tsx` | Post-completion "הוסף הערה?" prompt |
| `src/app/(dashboard)/students/[id]/page.tsx` | Full redesign: tabbed layout with 5 tabs |
| `src/app/portal/[orgId]/home/page.tsx` | Add learning goals section |
| `src/components/dashboard/Sidebar.tsx` | No change needed (homework already in sidebar) |
| `supabase/config.toml` | Register `homework-sender` hourly cron |
| `supabase/functions/homework-reminders/index.ts` | Skip assignments where `sent = false` (not yet sent) |
| `messages/he.json` | Add `homework.submissions.*`, `homework.grading.*`, `lessons.notes.*`, `students.tabs.*`, `students.goals.*` |
| `messages/en.json` | Same English keys |

---

## Acceptance Criteria

- [ ] Teacher can attach PDF/image files to a homework assignment
- [ ] Parent/student can view assignments and submit work (text + file) from portal
- [ ] Teacher can grade submissions (score 0–100 + feedback); parent receives WhatsApp notification
- [ ] Teacher can schedule homework to send at a future date/time; Edge Function sends it on time
- [ ] Teacher can add notes after a lesson; notes appear on lesson detail page
- [ ] Owner/admin can read all lesson notes; teacher sees only their own
- [ ] Student profile page shows 5 tabs with correct data in each
- [ ] Student overview shows attendance rate, homework completion rate, outstanding balance
- [ ] Owner/admin/teacher can create, update, and complete learning goals
- [ ] Goals visible on portal home for parents
- [ ] All new UI is i18n-ready (Hebrew + English)
- [ ] All new tables have RLS enabled
- [ ] All mutations use service role via `src/lib/supabase/service-role.ts`
- [ ] `npm run build` succeeds; `npm test` passes 100%

---

## Out of Scope

- Markdown in lesson notes (plain text only in v1)
- Custom grading rubrics (numeric 0–100 only)
- Homework analytics / aggregated reports (Sprint 28)
- `visible_to_parent` flag on lesson notes (Sprint 26 — Portal 2.0)
- Parent-teacher messaging (Sprint 26)
- File preview/thumbnail generation
- Homework templates with pre-attached files
- Bulk grading (grade all students at once)
- Student self-registration in portal
- Push notifications for new homework
