# Sprint 26 — Parent Portal 2.0
*Branch: `sprint-26`*
*Depends on: Sprint 25 complete*

---

## Carry-Over from Sprint 23/24/25

| Item | Reason |
|---|---|
| Sumit SaaS Billing E2E staging validation (manual checklist) | Not code — requires staging environment with real Sumit credentials. Deferred until staging is provisioned. |

---

## Closed Decisions (pre-sprint)

| Topic | Decision |
|---|---|
| Homework portal tab | **Already built** in Sprint 24 — full assignment list, detail page, file submission, grading view. No work needed for Story 2. |
| Tab bar expansion | **5 tabs** — add Schedule and Progress tabs, keep Home / Homework / Payments. Remove Book as a standalone tab; move booking CTA into Schedule tab. |
| Schedule calendar view | **Week view as default** with month toggle. Server-rendered page with client-side week navigation. |
| Cancel from portal | **Reuse `executeCancellation()`** from `src/lib/cancellation-flow/executeCancellation.ts`. Same charge logic as WhatsApp cancellation. Only scheduled lessons within 7 days. |
| Attendance history | **Inline on Schedule tab** — toggle between "upcoming" and "history" views. History shows completed/cancelled/no_show lessons. |
| Progress period selector | **30-day and 90-day** pills — simple client toggle, server query uses the selected period. |
| Teacher notes visibility | **New `visible_to_parent` boolean** on `lesson_notes` table. Teachers opt-in per note. Default `false`. |
| Messaging model | **Thread per student** — `portal_messages` table with `student_id`. Both parent and teacher can send. Teacher receives in-app notification. |
| Messaging auth | **Portal session** for parent sends; **dashboard session** for teacher replies. Separate server actions. |

---

## Context: What Was Already Built

| Feature | Status |
|---|---|
| Portal layout (mobile-first, max-width 480px, RTL/LTR) | Done (Sprint 13) |
| Portal auth (phone OTP → JWT cookie, 30-day TTL) | Done (Sprint 13) |
| Portal home (balance, 4 upcoming lessons, goals, book CTA) | Done (Sprint 13) |
| Portal booking flow (teacher → slots → confirm) | Done (Sprint 13) |
| Portal payments (pending charges + paid history + receipt links) | Done (Sprint 13) |
| Portal homework (assignment list + detail + submission + grading view) | Done (Sprint 24) |
| Portal GDPR deletion request | Done (Sprint 23) |
| PortalTabBar (4 tabs: home, homework, book, payments) | Done (Sprint 13/24) |
| `executeCancellation()` with charge calculation | Done (Sprint 4) |
| `cancellation_policies` table (notice_hours_full/partial, partial_charge_percent) | Done (Sprint 3) |
| `lesson_notes` table (CRUD, RBAC, lesson detail integration) | Done (Sprint 24) |
| `student_goals` table (CRUD, portal display, 3-status model) | Done (Sprint 24) |
| `in_app_notifications` with `createNotification()` | Done (Sprint 25) |
| `student_cancellation_events` table | Done (Sprint 22) |

---

## Goal

Elevate the parent portal from a minimal payment screen to a genuine parent engagement tool — visible progress, full schedule, homework visibility, and teacher communication. The homework tab is already complete; this sprint focuses on schedule/attendance, progress reports, and messaging.

---

## Story 1 — Full Schedule & Attendance History

**Why:** Parents currently see only "4 upcoming lessons" on the home page. They need a full schedule view and the ability to cancel lessons directly from the portal instead of calling or using WhatsApp.

### 1a — Schedule Tab (replaces Book tab)

- New route: `/portal/[orgId]/schedule/page.tsx`
- **Upcoming view (default):** All scheduled lessons for parent's children, grouped by day
  - Each lesson card: student name, teacher name, date/time, duration
  - "Book new lesson" CTA button at bottom (links to existing `/book` page)
  - Cancel button per lesson (only if within 7-day window and scheduled)
- **History view (toggle):** Past lessons with status badges
  - Statuses: completed (green), cancelled (amber), no_show (red)
  - Shows last 50 lessons, most recent first
- Week navigation: prev/next week buttons, "today" pill
- Server-rendered page with client-side view toggle (upcoming/history)

### 1b — Cancel Lesson from Portal

- New server action: `cancelLessonAction(orgId, lessonId)` in `/portal/[orgId]/schedule/actions.ts`
- Calls `executeCancellation(lessonId, session.parentId, orgId)` — reuses existing logic
- On success: shows charge info if applicable ("ביטול תוך X שעות — חיוב של ₪Y")
- On failure: shows appropriate error (already_cancelled, not_eligible, etc.)
- Sends cancellation confirmation via WhatsApp (existing template)
- Creates `in_app_notification` for teacher + owner (type: `lesson_cancelled`)
- Client component: `PortalCancelDialog.tsx` — confirmation dialog before cancel

### 1c — Update Home Page

- Replace "4 upcoming lessons" section with "3 upcoming lessons" + "View all →" link to schedule
- Keep balance card, goals, and GDPR deletion as-is
- Remove inline "Book" CTA button (moved to schedule tab)

---

## Story 2 — Homework Visibility in Portal

**Already complete** from Sprint 24. No additional work needed.

The portal already has:
- `/portal/[orgId]/homework` — assignment list with status badges (pending/done/overdue)
- `/portal/[orgId]/homework/[id]` — detail page with attachments, submission form, grading view
- `PortalSubmissionForm` component with file upload (20MB limit)

---

## Story 3 — Progress Report

**Why:** Parents want to see their child's overall progress — not just individual homework grades. A progress tab gives parents a monthly snapshot and encourages engagement.

### 3a — Progress Tab

- New route: `/portal/[orgId]/progress/page.tsx`
- Period selector pills: "30 ימים" / "90 ימים" (client toggle)
- **Per student** (if parent has multiple children, show each student in a section):

**Attendance card:**
- Lessons attended / total scheduled (e.g., "12 מתוך 14 שיעורים")
- Attendance percentage bar (visual)
- Query: `lessons` joined via `lesson_students` where `student_id = X` and `start_at` within period
  - Attended = status `completed`
  - Total = status in (`completed`, `cancelled`, `no_show`)

**Homework card:**
- Assignments completed / total assigned (e.g., "8 מתוך 10 משימות")
- Completion percentage
- Average score (if any graded submissions)
- Query: `homework_assignments` where `student_id = X` and `sent = true` and `created_at` within period

**Monthly summary card:**
- "החודש: X שיעורים, Y משימות הושלמו" (current calendar month)
- Simple stat, not a chart

### 3b — Learning Goals (existing)

- Already displayed on home page from Sprint 24
- Also show in progress tab grouped by student: subject, description, status badge, target date
- Reuse existing `getActiveGoalsForStudents()` query

### 3c — Teacher Notes (visible to parent)

- Add `visible_to_parent boolean DEFAULT false` to `lesson_notes` table (migration)
- Dashboard: add checkbox on lesson note form "הצג להורה" (show to parent)
- Progress tab: list notes where `visible_to_parent = true` for this student, most recent first (limit 10)
- Each note card: lesson date, teacher name, note body (truncated to 200 chars)

---

## Story 4 — Messaging (Teacher ↔ Parent)

**Why:** Parents currently rely on WhatsApp for all communication. An in-portal messaging thread provides a structured, per-student conversation that stays tied to the org context.

### 4a — Database & Lib

- New table: `portal_messages` (see Schema Changes)
- `src/lib/portal/messages.ts`:
  ```typescript
  export async function getConversation(orgId: string, studentId: string, parentId: string, limit?: number): Promise<PortalMessage[]>
  export async function sendPortalMessage(params: { orgId: string; studentId: string; senderParentId?: string; senderProfileId?: string; body: string }): Promise<void>
  export async function getUnreadCount(orgId: string, parentId: string): Promise<number>
  export async function markConversationRead(orgId: string, studentId: string, parentId: string): Promise<void>
  ```

### 4b — Portal Messages Tab

- New route: `/portal/[orgId]/messages/page.tsx`
- Lists all students with a conversation summary (last message preview, unread count badge)
- Click → `/portal/[orgId]/messages/[studentId]/page.tsx` — full thread
- Thread view: chronological messages, parent messages right-aligned, teacher messages left-aligned
- Input bar at bottom: text input + send button
- Server action: `sendMessageAction(orgId, studentId, _, formData)` in `/portal/[orgId]/messages/[studentId]/actions.ts`
- On send: creates `in_app_notification` for teacher (type: `portal_message`)

### 4c — Dashboard Thread View (Teacher Side)

- New route: `/app/(dashboard)/messages/page.tsx` — list of students with portal conversations
- Click → `/app/(dashboard)/messages/[studentId]/page.tsx` — thread view with reply
- Server action: `replyToPortalMessageAction(studentId, _, formData)` in actions.ts
- Uses `getSession()` + `requireMutation()` for auth
- Sidebar link: add "הודעות" to dashboard nav with unread count badge
- On reply: mark parent's messages as read

### 4d — Notification Triggers

- When parent sends a message → `createNotification()` for teacher + owner:
  - Type: `portal_message`
  - Title: "הודעה חדשה מ-{parentName}"
  - Action URL: `/messages/{studentId}`
- When teacher replies → no portal notification (parent sees on next visit)

---

## Schema Changes

```sql
-- Story 3c: Teacher notes visibility
ALTER TABLE lesson_notes
  ADD COLUMN visible_to_parent boolean NOT NULL DEFAULT false;

-- Story 4: Portal messaging
CREATE TABLE portal_messages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id        uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sender_parent_id  uuid        REFERENCES parents(id) ON DELETE SET NULL,
  sender_profile_id uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  body              text        NOT NULL,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_messages_one_sender
    CHECK (
      (sender_parent_id IS NOT NULL AND sender_profile_id IS NULL) OR
      (sender_parent_id IS NULL AND sender_profile_id IS NOT NULL)
    )
);
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_portal_messages"
  ON portal_messages AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX idx_portal_messages_thread
  ON portal_messages (organization_id, student_id, created_at);
CREATE INDEX idx_portal_messages_parent_unread
  ON portal_messages (organization_id, sender_profile_id)
  WHERE read_at IS NULL AND sender_profile_id IS NOT NULL;
```

**Migration file:** `supabase/migrations/20260503000001_sprint26_portal_v2.sql`

---

## PortalTabBar Update

Current tabs: Home, Homework, Book, Payments (4 tabs)
New tabs: Home, Schedule, Homework, Progress, Messages (5 tabs)

- **Removed:** Book (standalone tab) — booking CTA moves into Schedule tab
- **Added:** Schedule (calendar icon), Progress (chart icon), Messages (message icon)
- **Kept:** Home, Homework
- **Moved:** Payments becomes accessible from Home page balance card link (no dedicated tab)

---

## Files to Create

| File | Story |
|---|---|
| `supabase/migrations/20260503000001_sprint26_portal_v2.sql` | All |
| `src/app/portal/[orgId]/schedule/page.tsx` | 1a |
| `src/app/portal/[orgId]/schedule/actions.ts` | 1b |
| `src/components/portal/PortalCancelDialog.tsx` | 1b |
| `src/components/portal/PortalScheduleView.tsx` | 1a |
| `src/app/portal/[orgId]/progress/page.tsx` | 3a |
| `src/lib/portal/messages.ts` | 4a |
| `src/app/portal/[orgId]/messages/page.tsx` | 4b |
| `src/app/portal/[orgId]/messages/[studentId]/page.tsx` | 4b |
| `src/app/portal/[orgId]/messages/[studentId]/actions.ts` | 4b |
| `src/components/portal/PortalMessageThread.tsx` | 4b |
| `src/app/(dashboard)/messages/page.tsx` | 4c |
| `src/app/(dashboard)/messages/[studentId]/page.tsx` | 4c |
| `src/app/(dashboard)/messages/[studentId]/actions.ts` | 4c |

## Files to Modify

| File | Change |
|---|---|
| `src/components/portal/PortalTabBar.tsx` | Replace 4 tabs with 5 tabs (Home, Schedule, Homework, Progress, Messages) |
| `src/app/portal/[orgId]/home/page.tsx` | Trim to 3 upcoming lessons + "View all" link; remove inline Book CTA; add payments link |
| `src/app/(dashboard)/lessons/[id]/page.tsx` (or notes form) | Add "visible to parent" checkbox on lesson note creation |
| `messages/he.json` | Add `portalSchedule.*`, `portalProgress.*`, `portalMessages.*` keys |
| `messages/en.json` | Same English keys |
| `src/lib/notifications/index.ts` | Add `portal_message` to `NotificationType` union |

---

## Acceptance Criteria

- [ ] Portal has 5 tabs: Home, Schedule, Homework, Progress, Messages
- [ ] Schedule tab shows all upcoming lessons grouped by day with week navigation
- [ ] Schedule tab has toggle to switch to attendance history (completed/cancelled/no_show)
- [ ] Parent can cancel a scheduled lesson from the portal; charge is calculated per org policy
- [ ] Cancel confirmation dialog shows charge info before confirming
- [ ] Home page shows 3 upcoming lessons with "View all" link to schedule
- [ ] Progress tab shows attendance rate and homework completion rate per student
- [ ] Progress tab has 30-day / 90-day period selector
- [ ] Teacher notes marked `visible_to_parent = true` appear in progress tab
- [ ] Dashboard lesson note form has "show to parent" checkbox
- [ ] Messages tab shows list of students with last message preview
- [ ] Parent can send a message to the teacher per student thread
- [ ] Teacher receives in-app notification when parent sends a message
- [ ] Teacher can view and reply to portal messages from dashboard `/messages/`
- [ ] Conversation thread shows parent messages right-aligned, teacher messages left-aligned
- [ ] All new UI is i18n-ready (Hebrew + English)
- [ ] All new tables have RLS with deny policies (service-role only)
- [ ] All mutations use service role via `src/lib/supabase/service-role.ts`
- [ ] Portal actions verify `getPortalSession()` before any data access
- [ ] `npm run build` succeeds; `npm test` passes 100%

---

## Out of Scope

- Real-time messaging (WebSocket / Supabase Realtime) — polling or page refresh in v1
- Push notifications for portal (no service worker)
- Parent-to-parent messaging
- File attachments in messages
- Read receipts visible to teacher
- Monthly PDF progress report export
- Payments tab as standalone portal tab (accessible from home balance card)
- Booking flow changes (existing `/book` page unchanged)
