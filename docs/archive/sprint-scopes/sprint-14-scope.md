# Sprint 14 — Homework Module + WhatsApp Smart Intents

**Status:** Planned
**Branch:** `sprint-14`
**Depends on:** Sprint 13 complete
**Goal:** Teachers send homework via WhatsApp. Parents can query their status (balance, schedule, payment history, portal link) conversationally without calling the admin.

---

## Pre-Sprint State

Three gaps exist after Sprint 13:

1. **Homework:** There is no homework system. Teachers have no way to assign or track homework. Parents have no visibility into what was assigned. The dashboard is missing a critical daily-use workflow.

2. **WhatsApp self-service:** Parents can trigger booking and cancellation intents, but all other incoming messages from known parents are silently ignored. Parents who ask "כמה אני חייב?", "מתי השיעור הבא?", or "שלח לי קישור לפורטל" get no response, forcing them to call the admin.

3. **Redirect bug (carry-over from Sprint 13):** In `src/app/(dashboard)/lessons/new/actions.ts` and `src/app/(dashboard)/teacher/new-lesson/actions.ts`, `redirect()` is called inside a `try/catch` block. In Next.js App Router, `redirect()` throws a `NEXT_REDIRECT` error internally, which is caught by the surrounding catch block and converted into `{ error: 'something went wrong' }` instead of redirecting. This means successful lesson creation shows an error to the user instead of navigating to the lesson list. Must be fixed before any further lesson creation work.

---

## Story 0 — Carry-over Bug Fix: redirect() Inside try/catch

**Affected files:**
- `src/app/(dashboard)/lessons/new/actions.ts`
- `src/app/(dashboard)/teacher/new-lesson/actions.ts`

**Problem:** Next.js `redirect()` throws a `NEXT_REDIRECT` error that is internally used by the framework. When called inside a `try/catch` block, the catch handler intercepts this internal error and treats it as a failure, returning `{ error: ... }` to the form instead of navigating.

**Fix pattern:** Use `isRedirectError` from `next/dist/client/components/redirect-error` (or restructure to move `redirect()` outside the try/catch):

```typescript
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

// Option A — rethrow redirect errors
export async function createLessonAction(...) {
  try {
    const result = await createLesson(params)
    redirect(`/lessons/${result.lessonId}`)
  } catch (err) {
    if (isRedirectError(err)) throw err  // let Next.js handle redirect
    // ... handle real errors
  }
}

// Option B — move redirect outside try/catch
export async function createLessonAction(...) {
  let lessonId: string
  try {
    const result = await createLesson(params)
    lessonId = result.lessonId
  } catch (err) {
    // ... handle real errors
    return { error: '...' }
  }
  redirect(`/lessons/${lessonId}`)
}
```

Use **Option B** (move redirect outside try/catch) — it requires no imports from internal Next.js paths and is more readable.

**Out of scope:** Any other changes to lesson creation logic or UI.

---

## Story 1 — Schema: homework_templates + homework_assignments

**`supabase/migrations/20260414000001_homework.sql`** (new)

```sql
-- ── Homework templates ────────────────────────────────────────────────────────
-- Reusable homework templates created by teachers within an org.
CREATE TABLE homework_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           text NOT NULL,
  subject         text,
  body            text NOT NULL,  -- plain text, no markdown (Sprint 16 adds markdown)
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE homework_templates IS 'Reusable homework templates. Teachers create these once and reuse across assignments.';

ALTER TABLE homework_templates ENABLE ROW LEVEL SECURITY;

-- Teacher can read/insert/update/delete their org's templates
CREATE POLICY "org members can manage homework templates"
  ON homework_templates
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- ── Homework assignments ──────────────────────────────────────────────────────
-- One assignment per student per homework event.
CREATE TABLE homework_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES teachers(id),
  student_id      uuid NOT NULL REFERENCES students(id),
  template_id     uuid REFERENCES homework_templates(id) ON DELETE SET NULL,
  body            text NOT NULL,  -- copied from template at assignment time (denormalized)
  title           text NOT NULL,  -- copied from template or entered directly
  due_date        date,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'overdue')),
  sent_at         timestamptz,    -- when WhatsApp message was dispatched
  completed_at    timestamptz,    -- when status changed to 'done'
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE homework_assignments IS 'Per-student homework assignments. Body is denormalized from template at creation time.';

ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage homework assignments"
  ON homework_assignments
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Index for daily reminder cron: pending assignments with due_date tomorrow
CREATE INDEX idx_homework_assignments_pending_due
  ON homework_assignments(organization_id, due_date)
  WHERE status = 'pending';

-- ── Extend notification_log.type constraint ───────────────────────────────────
-- Add 'homework_reminder' to the allowed type values.
-- Note: Postgres does not support ALTER COLUMN ... DROP CONSTRAINT by name on
-- inline CHECK constraints — recreate the constraint instead.
ALTER TABLE notification_log DROP CONSTRAINT IF EXISTS notification_log_type_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_type_check
  CHECK (type IN (
    'lesson_reminder',
    'payment_reminder',
    'homework_reminder'
  ));
```

**RLS summary:**
- `homework_templates`: org members (owner / admin / teacher) can CRUD — all filtered by `organization_id`.
- `homework_assignments`: same — org members only.
- Service role bypasses RLS for Edge Function cron and webhook intent handlers.

---

## Story 2 — lib: homework

**`src/lib/homework/index.ts`** (new)

Public API for the homework module, used by server actions and Edge Functions.

```typescript
// Types
export type HomeworkTemplate = {
  id: string
  organizationId: string
  title: string
  subject: string | null
  body: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type HomeworkAssignment = {
  id: string
  organizationId: string
  teacherId: string
  studentId: string
  templateId: string | null
  title: string
  body: string
  dueDate: string | null   // YYYY-MM-DD
  status: 'pending' | 'done' | 'overdue'
  sentAt: string | null
  completedAt: string | null
  createdAt: string
}

// Queries
export async function getTemplates(orgId: string): Promise<HomeworkTemplate[]>
export async function getTemplate(orgId: string, templateId: string): Promise<HomeworkTemplate | null>
export async function getAssignments(orgId: string, filters?: {
  studentId?: string
  teacherId?: string
  status?: 'pending' | 'done' | 'overdue'
}): Promise<(HomeworkAssignment & { studentName: string; teacherName: string })[]>

// Mutations
export async function createTemplate(params: {
  orgId: string
  title: string
  subject?: string
  body: string
  createdBy: string
}): Promise<HomeworkTemplate>

export async function updateTemplate(params: {
  orgId: string
  templateId: string
  title: string
  subject?: string
  body: string
}): Promise<HomeworkTemplate>

export async function deleteTemplate(orgId: string, templateId: string): Promise<void>

export async function createAssignment(params: {
  orgId: string
  teacherId: string
  studentIds: string[]      // one assignment record per student
  templateId?: string       // if provided, body/title are copied from template
  title?: string            // required if no templateId
  body?: string             // required if no templateId
  dueDate?: string          // YYYY-MM-DD
}): Promise<HomeworkAssignment[]>

// Mark as done — called from webhook when parent replies "סיימתי"
export async function markAssignmentDone(assignmentId: string): Promise<HomeworkAssignment>

// Called by the homework-reminders Edge Function
export async function getAssignmentsDueTomorrow(orgId: string): Promise<(HomeworkAssignment & {
  studentName: string
  studentPhone: string | null
  primaryParentPhone: string | null
})[]>
```

**`src/lib/homework/sendHomework.ts`** (new)

Sends the homework via WhatsApp to the student (if `students.phone` set) or primary parent. Returns a boolean indicating whether the message was dispatched.

```typescript
export async function sendHomeworkAssignment(params: {
  orgId: string
  assignmentId: string
  accessToken: string
  phoneNumberId: string
}): Promise<boolean>
```

Logic:
1. Load the assignment (with student + primary parent).
2. Resolve target phone: `students.phone` → fallback to primary parent phone.
3. If no phone → log warning, return `false`.
4. Build message: `"שיעורי בית: [title]\n\n[body]"` + due date if set.
5. `sendTextMessage(targetPhone, message, accessToken, phoneNumberId)`.
6. Update `homework_assignments.sent_at = now()`.
7. Return `true`.

**`src/lib/whatsapp/index.ts`** — add intent detectors (used by webhook):

```typescript
export function hasHomeworkDoneIntent(text: string): boolean
// Matches: "סיימתי", "גמרתי", "עשיתי", "הכנתי" (case-insensitive)

export function hasBalanceIntent(text: string): boolean
// Matches: "חוב", "כמה אני חייב", "יתרה", "תשלום עומד"

export function hasScheduleIntent(text: string): boolean
// Matches: "שיעורים", "מתי שיעור", "לוז", "לו״ז", "לוח זמנים"

export function hasReceiptIntent(text: string): boolean
// Matches: "קבלה", "היסטוריה", "מה שילמתי", "תשלומים"

export function hasPortalIntent(text: string): boolean
// Matches: "פורטל", "כניסה", "אזור אישי", "לינק", "קישור"
```

---

## Story 3 — /homework/templates — Teacher CRUD

**Files:**
- `src/app/(dashboard)/homework/templates/page.tsx` (new)
- `src/app/(dashboard)/homework/templates/actions.ts` (new)
- `src/app/(dashboard)/homework/templates/TemplateForm.tsx` (new)

**Access control:** owner + admin + teacher (all authenticated dashboard roles).

**`page.tsx`** (server component):
- Fetches all templates for `orgId`.
- Shows a list with title, subject, truncated body, edit/delete controls.
- "הוסף תבנית" button opens a drawer/modal or navigates to `/homework/templates/new`.
- Inline empty state when no templates.

**`actions.ts`:**

```typescript
'use server'

// Zod schema for template form
const TemplateSchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.string().max(100).optional(),
  body: z.string().min(1).max(2000),
})

export async function createTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState>
// Validates schema, calls createTemplate(), returns { error } or { success }

export async function updateTemplateAction(
  templateId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState>
// Validates schema, calls updateTemplate(), RLS enforces org membership

export async function deleteTemplateAction(
  templateId: string
): Promise<{ error?: string }>
// Calls deleteTemplate() — RLS enforces org membership
// Error if templateId has pending assignments (prevent orphaning)
```

**`TemplateForm.tsx`** (client component):
- Props: `{ action, initialValues?, submitLabel }`
- Fields: title (text), subject (text, optional), body (textarea)
- `useActionState(action, { error: null, success: false })`
- Inline error/success display.

**Out of scope for this story:** Viewing all assignments per template, template usage stats.

---

## Story 4 — /homework/assign — Assign Homework to Student(s)

**Files:**
- `src/app/(dashboard)/homework/assign/page.tsx` (new)
- `src/app/(dashboard)/homework/assign/actions.ts` (new)
- `src/components/dashboard/homework/AssignForm.tsx` (new)

**Access control:** owner + admin + teacher.

**`page.tsx`** (server component):
- Fetches all students + all templates for `orgId`.
- Passes props to `AssignForm`.

**`AssignForm.tsx`** (client component):
- Two modes, toggled by "מתבנית / ידנית" toggle:
  - **Template mode:** `<select>` of templates → title + body auto-populated (read-only preview).
  - **Ad-hoc mode:** title + body text inputs.
- Multi-select for students (checkboxes or multi-select UI).
- Optional due_date picker.
- On submit: calls `assignHomeworkAction`.
- On success: shows "נשלח בהצלחה ל-N תלמידים" + link to `/homework`.

**`actions.ts`:**

```typescript
'use server'

const AssignSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1),
  templateId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(2000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine(
  data => data.templateId || (data.title && data.body),
  { message: 'נדרשת תבנית או כותרת + תוכן' }
)

export async function assignHomeworkAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState>
```

Logic:
1. Parse + validate with `AssignSchema`.
2. If `templateId` → load template body/title (override any submitted body/title).
3. Resolve teacher: `getSession()` → if role is `'teacher'`, use `session.profileId` to resolve `teachers.id`; if owner/admin, teacher defaults to the assigned teacher of the student's most recent lesson (or the first teacher in org — document as known simplification).
4. Call `createAssignment({ orgId, teacherId, studentIds, ... })`.
5. For each created assignment: call `sendHomeworkAssignment({ ... })` (fire-and-forget — log failure, don't throw).
6. Return `{ success: true, count: assignments.length }`.

**Out of scope:** Bulk assignment to all students, lesson-linked homework, assignment editing.

---

## Story 5 — Homework List Page

**Files:**
- `src/app/(dashboard)/homework/page.tsx` (new)

**Access control:** owner + admin + teacher.

**`page.tsx`** (server component):
- Fetches all assignments for `orgId`, ordered by `created_at DESC`.
- Columns: student name, title, due date, status badge (pending / done / overdue), sent_at, completed_at.
- Filter by status (query param `?status=pending|done|overdue`).
- Empty state when no assignments.
- Links to `/homework/templates` and `/homework/assign`.

**No server actions needed** — this is read-only. Status transitions happen via webhook ("סיימתי") or the cron (overdue marking).

**Out of scope:** Individual assignment detail page, pagination (use `LIMIT 100` for now), teacher filtering.

---

## Story 6 — supabase/functions/homework-reminders

**`supabase/functions/homework-reminders/index.ts`** (new)

Daily cron function. Runs at 08:00 UTC (11:00 Israel time).

**Logic:**
1. Query all orgs with `reminders_enabled = true` and a connected WhatsApp number.
2. For each org:
   a. Call `getAssignmentsDueTomorrow(orgId)` (date = today + 1 day in org timezone).
   b. For each assignment: resolve target phone (student phone → primary parent phone).
   c. If phone found and not already notified today (check `notification_log`):
      - Send reminder: `"תזכורת לשיעורי בית: [title]. מחר הגשה! 📚"`
      - Insert row into `notification_log(org_id, type='homework_reminder', ref_id=assignment.id, sent_to=phone)`.
3. Log summary.

**`supabase/config.toml`** — add cron entry:
```toml
[functions.homework-reminders]
verify_jwt = false

[[functions.homework-reminders.cron]]
schedule = "0 8 * * *"
```

**Shared helpers reused:** `supabase/functions/_shared/crypto.ts`, `supabase/functions/_shared/whatsapp.ts`.

**Out of scope:** Multiple reminder sends per assignment (same rule as payment reminders — one per day max), reminder at assignment creation time (handled by `sendHomeworkAssignment` synchronously).

---

## Story 7 — WhatsApp Smart Intents

Extend `src/app/api/whatsapp/webhook/route.ts` to respond to self-service parent queries.

### Intent order (within `processMessage`, after active cancellation session check):

```
1. Active cancellation session?  → handleCancellationSelection (existing)
2. hasCancellationIntent?        → handleCancellationIntent (existing)
3. hasHomeworkDoneIntent?        → handleHomeworkDone (NEW)
4. hasBalanceIntent?             → handleBalanceQuery (NEW)
5. hasScheduleIntent?            → handleScheduleQuery (NEW)
6. hasReceiptIntent?             → handleReceiptQuery (NEW)
7. hasPortalIntent?              → handlePortalQuery (NEW)
8. hasBookingIntent?             → booking link (existing)
9. (no match)                    → handleUnknownIntent (NEW — polite fallback)
```

The `handleUnknownIntent` fallback is **new**: unknown messages from known parents currently get no reply. In Sprint 14, they receive: `"שלום 👋 לא הצלחתי להבין את הבקשה שלך. אפשר לשלוח: 'הזמנה' לקביעת שיעור, 'ביטול' לביטול שיעור, 'חוב' לסגירת יתרה, 'שיעורים' ללוח זמנים, 'פורטל' לגישה לאזור האישי."`.

### New handler functions in `route.ts`:

**`handleHomeworkDone`** — marks the parent's most recent pending assignment as done:
1. Query `homework_assignments` for this `parentId`'s students, `status = 'pending'`, ordered by `created_at DESC`, limit 1.
2. If found: `markAssignmentDone(assignment.id)`, send teacher a WhatsApp alert: `"[student_name] סיים/ה את שיעורי הבית: [title] ✅"`.
3. Reply to parent: `"מעולה! שיעורי הבית של [student_name] סומנו כהושלמו 🎉"`.
4. If not found: reply `"לא נמצאו שיעורי בית פתוחים לסימון."`.

**`handleBalanceQuery`** — returns outstanding balance + payment links:
1. Query `charges` for this parent's students: `status IN ('pending', 'invoiced')`, sum `amount`.
2. If balance = 0: reply `"אין חוב פתוח כרגע 🎉"`.
3. If balance > 0: build reply with total amount + up to 3 payment links (most recent unpaid charges with `payment_link` set).
4. Reply format: `"היתרה שלך: ₪[total]\n\n[charge 1: ₪X — קישור לתשלום: link]\n[charge 2: ...]"`.

**`handleScheduleQuery`** — returns next 3 scheduled lessons:
1. Query `lessons` joined to `lesson_students` for this parent's students, `status = 'scheduled'`, `starts_at > now()`, order by `starts_at ASC`, limit 3.
2. Format each lesson in org timezone (Luxon): `"[day], [date] בשעה [time] עם [teacher_name]"`.
3. If no upcoming lessons: `"אין שיעורים מתוכננים כרגע."`.

**`handleReceiptQuery`** — returns last 3 paid charges:
1. Query `charges` for this parent's students: `status = 'paid'`, ordered by `updated_at DESC`, limit 3.
2. Format: `"[date]: ₪[amount] — שולם"`.
3. If none: `"לא נמצאו תשלומים קודמים."`.

**`handlePortalQuery`** — sends portal link:
1. Build `${process.env.NEXT_PUBLIC_APP_URL}/portal/${orgId}`.
2. Reply: `"קישור לאזור האישי שלך:\n${portalUrl}\n\nניתן להתחבר עם מספר הטלפון שלך."`.

### New WhatsApp send helpers in `src/lib/whatsapp/index.ts`:

```typescript
export async function sendHomeworkAlert(teacherPhone: string, studentName: string, homeworkTitle: string, accessToken: string, phoneNumberId: string): Promise<void>
export async function sendHomeworkReminder(phone: string, title: string, accessToken: string, phoneNumberId: string): Promise<void>
export async function sendBalanceReply(phone: string, total: number, charges: { amount: number; paymentLink: string | null }[], accessToken: string, phoneNumberId: string): Promise<void>
export async function sendScheduleReply(phone: string, lessons: { date: string; time: string; teacherName: string }[], accessToken: string, phoneNumberId: string): Promise<void>
export async function sendReceiptReply(phone: string, charges: { date: string; amount: number }[], accessToken: string, phoneNumberId: string): Promise<void>
export async function sendPortalReply(phone: string, portalUrl: string, accessToken: string, phoneNumberId: string): Promise<void>
export async function sendUnknownIntentReply(phone: string, accessToken: string, phoneNumberId: string): Promise<void>
```

All functions use existing `sendTextMessage` internally — no new Meta API primitives.

---

## Story 8 — Sidebar + Navigation

**`src/components/dashboard/Sidebar.tsx`** — add homework nav items to the ops section:

```typescript
// In the 'ops' section, after 'leads':
{ href: '/homework', label: 'שיעורי בית', icon: BookOpen, roles: ['owner', 'admin', 'teacher'] },
```

**`src/app/(dashboard)/homework/templates/page.tsx`** — "תבניות" is accessible via a tab/link within the homework section, not a separate sidebar item (avoids sidebar bloat).

**`src/app/(dashboard)/homework/loading.tsx`** (new) — spinner skeleton, consistent with `/lessons/loading.tsx`.

---

## Story 9 — Homework Overdue Marking (Cron Extension)

**`supabase/functions/homework-reminders/index.ts`** — at the start of the daily run, mark past-due assignments as overdue:

```sql
UPDATE homework_assignments
SET status = 'overdue'
WHERE status = 'pending'
  AND due_date < CURRENT_DATE
  AND organization_id = $orgId;
```

Run this before querying "due tomorrow" so the daily run stays consistent.

**Alternative:** A separate cron or a DB trigger. Keeping it in the same Edge Function simplifies ops — one function, one schedule.

---

## Key Files Changed/Created

### New files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260414000001_homework.sql` | Schema: homework_templates + homework_assignments + notification_log constraint update |
| `src/lib/homework/index.ts` | Homework queries + mutations |
| `src/lib/homework/sendHomework.ts` | WhatsApp dispatch for assignments |
| `src/app/(dashboard)/homework/page.tsx` | Assignment list view |
| `src/app/(dashboard)/homework/loading.tsx` | Skeleton loading state |
| `src/app/(dashboard)/homework/templates/page.tsx` | Template CRUD list |
| `src/app/(dashboard)/homework/templates/actions.ts` | Template server actions |
| `src/app/(dashboard)/homework/templates/TemplateForm.tsx` | Template create/edit form |
| `src/app/(dashboard)/homework/assign/page.tsx` | Assign homework to student(s) |
| `src/app/(dashboard)/homework/assign/actions.ts` | Assignment server action |
| `src/components/dashboard/homework/AssignForm.tsx` | Assignment form component |
| `supabase/functions/homework-reminders/index.ts` | Daily homework reminder cron |

### Modified files
| File | Change |
|------|--------|
| `src/app/(dashboard)/lessons/new/actions.ts` | Bug fix: redirect() outside try/catch (Story 0) |
| `src/app/(dashboard)/teacher/new-lesson/actions.ts` | Bug fix: redirect() outside try/catch (Story 0) |
| `src/lib/whatsapp/index.ts` | Add 5 intent detectors + 7 send helpers |
| `src/app/api/whatsapp/webhook/route.ts` | Add 5 new intent handlers + unknown-intent fallback |
| `src/components/dashboard/Sidebar.tsx` | Add homework nav item |
| `supabase/config.toml` | Register homework-reminders cron |
| `AGENTS.md` | Update implementation status table |

---

## What Is NOT in Sprint 14

- **Homework markdown rendering** — plain text only. Markdown reserved for Sprint 16 when a sanitization pipeline is in place.
- **Student homework view in portal** — portal homework tab deferred (Sprint 15 backlog candidate).
- **Homework completion via portal** — parent marks done from portal (deferred — webhook "סיימתי" covers the MVP case).
- **Teacher filtering in homework list** — always shows all org homework; per-teacher filter is a Sprint 17 analytics concern.
- **Multi-student "homework done" ambiguity** — if parent has multiple students with pending homework, "סיימתי" marks the most recently assigned one. Document as a known limitation. Sprint 17 adds smarter disambiguation.
- **Tax receipts** (Sprint 15), **Bit/PayBox** (Sprint 15), **iCal export** (Sprint 16).
- **AI assistant fallback** — `handleUnknownIntentReply` is a static string, not AI. AI is Sprint 19.
- **WhatsApp template messages** (Meta approval) — Sprint 22. All sends in this sprint are session messages.
- **Bulk homework** — assign to all students at once (future Sprint 16+).
- **Homework attachment/photo** — Meta template messages required for media; deferred Sprint 22.

---

## Lessons Learned from Sprint 13

1. **`redirect()` inside try/catch is a silent failure.** Never wrap `redirect()` in a catch block. Always move `redirect()` after the try/catch or rethrow `NEXT_REDIRECT` errors explicitly. This rule should be noted in `AGENTS.md` Ground Rules.

2. **Booking components are not reusable across auth contexts.** `TeacherSelect`, `AvailabilityCalendar`, `BookingConfirm` hardcode imports from `/book/[token]/actions` and cannot be reused in the portal without modification. The portal solved this by building `PortalBookingFlow` as a fully self-contained component. Lesson: shared UI components that depend on server actions must either receive `action` as a prop or be reimplemented for each context.

3. **`useActionState` with `.bind()` works well for server actions with extra params.** The pattern `const boundAction = requestOtpAction.bind(null, orgId)` is clean and TypeScript-safe.

4. **Server component → client component → server action is the correct two-step form pattern.** For multi-step flows (phone → OTP), use a server component that reads `searchParams`, renders a client component, and uses URL params (not state) to persist step across navigations. This avoids client-side state loss on refresh.

5. **Write tool requires prior Read.** Always `Read` a file before using `Write` to replace it, even for new sections. Use `Edit` for targeted changes to avoid overwriting unread sections.

---

## Architecture After Sprint 14

```
Parent WhatsApp Message
  ↓
route.ts processMessage()
  ├─ Unknown sender?            → upsertLead + sendUnknownParentReply
  ├─ Active cancellation?       → handleCancellationSelection
  ├─ Cancellation intent?       → handleCancellationIntent
  ├─ Homework done intent?      → handleHomeworkDone          ← NEW
  ├─ Balance intent?            → handleBalanceQuery           ← NEW
  ├─ Schedule intent?           → handleScheduleQuery          ← NEW
  ├─ Receipt intent?            → handleReceiptQuery           ← NEW
  ├─ Portal intent?             → handlePortalQuery            ← NEW
  ├─ Booking intent?            → sendBookingLink
  └─ (no match)                 → sendUnknownIntentReply       ← NEW

Edge Functions (Supabase cron):
  lesson-reminders   (hourly)         → lesson reminder WhatsApp
  payment-reminders  (daily 09:00)    → overdue payment WhatsApp
  homework-reminders (daily 08:00)    → homework due-tomorrow WhatsApp  ← NEW
                                        + marks overdue assignments
```

---

## Ground Rules Additions (for AGENTS.md)

After Sprint 14 completes, add to AGENTS.md Ground Rules:

```
15. Never call redirect() inside a try/catch block. Move redirect() after the
    try/catch, or rethrow isRedirectError(err) explicitly. See Sprint 14 Story 0.
16. UI components that invoke server actions must receive the action as a prop
    or be fully reimplemented per context. Never hardcode server action imports
    into shared UI components.
```
