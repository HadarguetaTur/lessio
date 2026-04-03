# Sprint 16 — Custom Message Templates + iCal Export + Portal Receipt View

**Status:** Planned
**Branch:** `sprint-16`
**Depends on:** Sprint 15 complete
**Goal:** Three distinct value items that share low coupling and high readiness. Owners customize every WhatsApp message their org sends. Teachers get a calendar subscription URL that syncs to any calendar app. Parents see receipt links in the portal.

---

## Pre-Sprint State

After Sprint 15, three gaps remain:

1. **All WhatsApp messages are hardcoded Hebrew strings.** Every tutoring business has its own tone and phrasing preferences. Owners cannot customize anything without a code deploy.

2. **Teachers have no calendar integration.** They must log in to the dashboard to see their schedule. There is no way to subscribe from Google Calendar, Apple Calendar, or Outlook.

3. **Parents cannot see their receipts in the portal.** `charges.receipt_url` was added in Sprint 15 and is populated by חשבוניות ירוקות, but the portal payments page does not surface it. Parents must call the admin to get a receipt link.

---

## Story 0 — Schema Migration

**`supabase/migrations/20260416000001_message_templates_and_ical.sql`** (new)

```sql
-- ── Custom message templates ────────────────────────────────────────────────
CREATE TABLE message_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text        NOT NULL,
  body_template   text        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, type)
);

-- type is a free-text enum; valid values enforced at the application layer:
--   booking_link | booking_confirmation | lesson_reminder | payment_reminder
--   payment_request | cancellation_confirmation | cancellation_admin_alert
--   receipt_notification | homework_assignment | homework_reminder
--   balance_reply | schedule_reply | portal_link_reply | unknown_intent_fallback

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read own templates"
  ON message_templates FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "owner can manage own templates"
  ON message_templates FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- ── iCal token on teachers ──────────────────────────────────────────────────
-- UUID used as an opaque subscription token.
-- Regenerating (UPDATE to gen_random_uuid()) immediately invalidates old URLs.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS ical_token uuid DEFAULT gen_random_uuid();

-- Index for fast token lookup in the calendar endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS teachers_ical_token_idx ON teachers(ical_token);
```

**Out of scope:** Adding `message_templates` rows via seed data (the system always falls back to default strings; rows are optional).

---

## Story 1 — Template Resolution Engine

The engine lives in two places: Next.js (for dashboard-triggered messages) and the Deno Edge Functions (for cron-triggered messages). Both implementations are functionally identical — query `message_templates`, substitute variables, fall back to the system default.

### `src/lib/whatsapp/templates.ts` (new — Next.js / Node)

```typescript
/**
 * Template resolution for WhatsApp messages.
 *
 * Usage:
 *   const body = await resolveTemplate(orgId, 'lesson_reminder', {
 *     parent_name: 'דנה',
 *     teacher_name: 'אהרון',
 *     date: 'יום שני, 21.4',
 *     time: '17:00',
 *   })
 *   await sendTextMessage(phone, body, token, phoneNumberId)
 *
 * Variable syntax: {{variable_name}} (double braces, no spaces)
 * Unrecognised variables are left as-is (fail-safe).
 */

export type MessageTemplateType =
  | 'booking_link'
  | 'booking_confirmation'
  | 'lesson_reminder'
  | 'payment_reminder'
  | 'payment_request'
  | 'cancellation_confirmation'
  | 'cancellation_admin_alert'
  | 'receipt_notification'
  | 'homework_assignment'
  | 'homework_reminder'
  | 'balance_reply'
  | 'schedule_reply'
  | 'portal_link_reply'
  | 'unknown_intent_fallback'

/**
 * System-default Hebrew strings (used when no custom template is configured).
 * Keys must cover every MessageTemplateType.
 * Variables are expressed with {{name}} — same syntax as custom templates.
 */
export const DEFAULT_TEMPLATES: Record<MessageTemplateType, string> = {
  booking_link:
    'קבע/י שיעור — לחץ/י על הקישור (בתוקף ל-15 דקות):\n{{booking_url}}',
  booking_confirmation:
    '✅ השיעור נקבע!\nמורה: {{teacher_name}}\nתאריך: {{date}}\nשעה: {{time}}',
  lesson_reminder:
    '📅 תזכורת: שיעור עם {{teacher_name}} {{date}} בשעה {{time}}.',
  payment_reminder:
    '💳 יש לך חוב פתוח של ₪{{amount}}. לתשלום: {{payment_link}}',
  payment_request:
    'בקשת תשלום ₪{{amount}} עבור {{description}}:\n{{payment_link}}',
  cancellation_confirmation:
    '✅ השיעור בוטל.\n{{student_name}} עם {{teacher_name}}\n{{date}}, {{time}}{{charge_line}}',
  cancellation_admin_alert:
    '🔔 ביטול שיעור\nתלמיד: {{student_name}}\nמורה: {{teacher_name}}\n{{date}}, {{time}}{{charge_line}}\nמבטל/ת: {{parent_phone}}',
  receipt_notification:
    'קבלה על תשלום ₪{{amount}}:\n{{receipt_url}}',
  homework_assignment:
    '📚 שיעורי בית חדשים: {{title}}\n{{body}}\n{{due_line}}',
  homework_reminder:
    '📚 תזכורת: שיעורי הבית "{{title}}" צריכים להיות מוכנים מחר{{due_date_suffix}}.',
  balance_reply:
    'היתרה שלך: ₪{{total}}{{charge_lines}}',
  schedule_reply:
    'השיעורים הקרובים שלך:\n{{lesson_lines}}',
  portal_link_reply:
    'קישור לאזור האישי שלך:\n{{portal_url}}\n\nניתן להתחבר עם מספר הטלפון שלך.',
  unknown_intent_fallback:
    'שלום 👋 לא הצלחתי להבין את הבקשה שלך.\nניתן לשלוח:\n• הזמנה — לקביעת שיעור\n• ביטול — לביטול שיעור\n• חוב — לסגירת יתרה\n• שיעורים — ללוח זמנים\n• פורטל — לגישה לאזור האישי',
}

/**
 * Resolves the message body for the given org and template type.
 *
 * 1. Queries message_templates for a custom row.
 * 2. Falls back to DEFAULT_TEMPLATES[type] if no custom row exists.
 * 3. Substitutes {{variable}} placeholders with the provided vars map.
 */
export async function resolveTemplate(
  orgId: string,
  type: MessageTemplateType,
  vars: Record<string, string>
): Promise<string>

/**
 * Pure substitution — exported for testing and preview rendering.
 */
export function substituteVars(template: string, vars: Record<string, string>): string
```

**`resolveTemplate` implementation notes:**
- Uses `createServiceRoleClient()` (already available in Next.js).
- Query: `SELECT body_template FROM message_templates WHERE organization_id = $1 AND type = $2 LIMIT 1`.
- If the DB query fails (network error, timeout), log the error and fall back to the default string — template resolution failure must never block message sending.

### `supabase/functions/_shared/templates.ts` (new — Deno)

Identical contract to the Next.js version, but uses the Deno Supabase client pattern already established in `supabase/functions/_shared/`.

```typescript
// Same DEFAULT_TEMPLATES object (duplicated intentionally — Deno cannot import from src/)
// resolveTemplate(supabaseClient, orgId, type, vars) — takes client as first arg (Deno pattern)
// substituteVars(template, vars) — identical pure function
```

---

## Story 2 — Update WhatsApp Send Functions

Replace hardcoded message strings at each call site with `resolveTemplate`. The send functions themselves (`sendTextMessage`, etc.) are unchanged — they still accept a pre-built `text: string`.

### Call-site changes (Next.js)

| Current function | Template type | Call site |
|---|---|---|
| `sendBookingLink` | `booking_link` | `src/lib/booking/confirmBooking.ts` |
| `sendBookingConfirmation` | `booking_confirmation` | `src/lib/booking/confirmBooking.ts` |
| `sendCancellationConfirmation` | `cancellation_confirmation` | `src/lib/cancellation-flow/` |
| `sendCancellationAdminAlert` | `cancellation_admin_alert` | `src/lib/cancellation-flow/` |
| `sendReceiptMessage` | `receipt_notification` | `src/lib/receipts/issueReceiptForCharge.ts` |
| `sendBalanceReply` | `balance_reply` | `src/app/api/whatsapp/webhook/route.ts` |
| `sendScheduleReply` | `schedule_reply` | `src/app/api/whatsapp/webhook/route.ts` |
| `sendReceiptReply` | `balance_reply` (reuse, with receipt lines) | `src/app/api/whatsapp/webhook/route.ts` |
| `sendPortalReply` | `portal_link_reply` | `src/app/api/whatsapp/webhook/route.ts` |
| `sendUnknownIntentReply` | `unknown_intent_fallback` | `src/app/api/whatsapp/webhook/route.ts` |

**Pattern at each call site:**
```typescript
// Before:
await sendBookingConfirmation(phone, teacherName, startAt, token, phoneNumberId)

// After:
const body = await resolveTemplate(orgId, 'booking_confirmation', {
  teacher_name: teacherName,
  date: formatDate(startAt, timezone),
  time: formatTime(startAt, timezone),
})
await sendTextMessage(phone, body, token, phoneNumberId)
```

**Implementation note:** The old helper functions (`sendBookingConfirmation`, `sendCancellationConfirmation`, etc.) are deprecated but not deleted in this sprint — they remain in `src/lib/whatsapp/index.ts` with a `@deprecated` comment. Deletion happens in Sprint 17 cleanup.

### Call-site changes (Deno Edge Functions)

| Edge Function | Template type |
|---|---|
| `lesson-reminders/index.ts` | `lesson_reminder` |
| `payment-reminders/index.ts` | `payment_reminder` |
| `homework-reminders/index.ts` | `homework_reminder` + `homework_assignment` |

Pattern: each Edge Function calls `resolveTemplate(supabaseClient, orgId, type, vars)` from `_shared/templates.ts` before calling `sendTextMessage` from `_shared/whatsapp.ts`.

**Out of scope:** Migrating `sendNoEligibleLessonsReply`, `sendInvalidSelectionReply`, `sendCancellationTimeoutReply`, `sendCancellationLessonList`, `sendHomeworkAlert` — these are state-machine internal messages not user-facing enough to warrant per-org customization. Deferred to Sprint 17 if customer feedback demands it.

---

## Story 3 — /settings/message-templates Dashboard

**Access control:** `owner` only.

**`src/app/(dashboard)/settings/message-templates/page.tsx`** (new — server component)

- Loads all 14 template types.
- For each type: fetches the org's custom row if it exists, otherwise shows the system default.
- Renders a list of `MessageTemplateCard` components.

**`src/app/(dashboard)/settings/message-templates/actions.ts`** (new)

```typescript
'use server'

const TemplateSchema = z.object({
  type:          z.string().min(1),
  body_template: z.string().min(1, 'תוכן ההודעה לא יכול להיות ריק'),
})

/**
 * Upserts a custom template for this org.
 * Uses INSERT ... ON CONFLICT (organization_id, type) DO UPDATE.
 */
export async function saveTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState>

/**
 * Deletes the custom template row (org reverts to system default).
 */
export async function resetTemplateAction(type: string): Promise<{ error?: string }>
```

**UI design for each template card:**
- Header: template type label in Hebrew (e.g. "אישור הזמנת שיעור")
- Body: `<textarea>` pre-filled with custom body or system default (greyed out if default)
- Variable hint: small tooltip listing available `{{variable}}` names for this type
- Actions: "שמור", "איפוס לברירת מחדל" (reset — only visible when custom row exists)
- Live preview section: renders the resolved text with example variable values (client-side substitution using `substituteVars` ported to client JS — no server round-trip)

**Available variables per template type** (shown in the UI hint):

| Type | Variables |
|---|---|
| `booking_link` | `{{booking_url}}` |
| `booking_confirmation` | `{{teacher_name}}`, `{{date}}`, `{{time}}` |
| `lesson_reminder` | `{{teacher_name}}`, `{{date}}`, `{{time}}` |
| `payment_reminder` | `{{amount}}`, `{{payment_link}}` |
| `payment_request` | `{{amount}}`, `{{description}}`, `{{payment_link}}` |
| `cancellation_confirmation` | `{{student_name}}`, `{{teacher_name}}`, `{{date}}`, `{{time}}`, `{{charge_line}}` |
| `cancellation_admin_alert` | `{{student_name}}`, `{{teacher_name}}`, `{{date}}`, `{{time}}`, `{{charge_line}}`, `{{parent_phone}}` |
| `receipt_notification` | `{{amount}}`, `{{receipt_url}}` |
| `homework_assignment` | `{{title}}`, `{{body}}`, `{{due_line}}` |
| `homework_reminder` | `{{title}}`, `{{due_date_suffix}}` |
| `balance_reply` | `{{total}}`, `{{charge_lines}}` |
| `schedule_reply` | `{{lesson_lines}}` |
| `portal_link_reply` | `{{portal_url}}` |
| `unknown_intent_fallback` | _(no variables)_ |

**Sidebar** — add to settings section in `Sidebar.tsx`:
```typescript
{ href: '/settings/message-templates', label: 'הודעות', icon: MessageSquare, roles: ['owner'] }
```

**`/settings/page.tsx`** — add a card for "הודעות WhatsApp" in the settings landing grid.

---

## Story 4 — iCal Calendar Export

### Schema change (in Story 0 migration)

`teachers.ical_token uuid DEFAULT gen_random_uuid()` — already covered above.

### `src/lib/ical/index.ts` (new)

Generates a valid RFC 5545 iCal file string. No external library — hand-built to avoid dependency bloat.

```typescript
export interface ICalLesson {
  id:           string  // used as UID
  startAt:      string  // ISO UTC
  endAt:        string  // ISO UTC
  teacherName:  string
  studentNames: string[]
  orgName:      string
  timezone:     string
}

/**
 * Returns a valid .ics string for the given lessons.
 *
 * Spec compliance:
 * - PRODID: -//LESSIO//LESSIO Calendar//HE
 * - VERSION: 2.0
 * - CALNAME: "<teacherName> — <orgName>"
 * - Each lesson → VEVENT with UID, DTSTART, DTEND, SUMMARY, DESCRIPTION
 * - Line folding at 75 octets (RFC 5545 §3.1)
 * - CRLF line endings
 */
export function generateICalString(
  teacherName: string,
  orgName: string,
  lessons: ICalLesson[]
): string
```

**VEVENT per lesson:**
```
BEGIN:VEVENT
UID:<lesson.id>@lessio
DTSTART:<startAt formatted as YYYYMMDDTHHmmssZ>
DTEND:<endAt formatted as YYYYMMDDTHHmmssZ>
SUMMARY:שיעור — <studentNames.join(', ')>
DESCRIPTION:מורה: <teacherName>
ORGANIZER;CN=<orgName>:MAILTO:noreply@lessio.app
END:VEVENT
```

### `src/app/api/calendar/[token]/route.ts` (new)

```typescript
/**
 * GET /api/calendar/[token]
 *
 * Public, unauthenticated route.
 * Looks up teacher by ical_token (UUID stored in DB).
 * Returns a .ics file for all 'scheduled' lessons:
 *   - Past 4 weeks (for calendar history)
 *   - Next 6 months (standard subscription window)
 *
 * Response headers:
 *   Content-Type: text/calendar; charset=utf-8
 *   Content-Disposition: attachment; filename="lessio-calendar.ics"
 *   Cache-Control: no-cache, no-store  (always fresh — no stale slots)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response>
```

**Security notes:**
- No authentication needed — the UUID token is the auth secret (UUID v4 = 122 bits of entropy).
- Token lookup: `SELECT id, organization_id FROM teachers WHERE ical_token = $1` — returns 404 if not found.
- Query uses `serviceRole` — lessons are fetched regardless of RLS (teacher's own data only, filtered by `teacher_id`).
- Route must be added to `proxy.ts` public bypass list (no Supabase session required).

### `src/app/(dashboard)/teacher/calendar/page.tsx` (new — server component)

**Access control:** `teacher` role only.

```typescript
/**
 * Teacher calendar subscription page.
 * Shows the iCal URL and regenerate button.
 */
```

**Page content:**
- Header: "מנוי ליומן"
- Explanation: "הוסף/י את לוח הזמנים שלך לגוגל קלנדר, אפל קלנדר, או Outlook"
- `CalendarSubscribeSection` (client component):
  - Displays the full iCal URL: `https://<APP_URL>/api/calendar/<token>`
  - "העתק קישור" button (copies to clipboard)
  - "חדש קישור" button (calls `regenerateCalendarTokenAction` → redirects back)
  - Step-by-step instructions for Google / Apple / Outlook (collapsed `<details>` each)

**`src/app/(dashboard)/teacher/calendar/actions.ts`** (new)

```typescript
'use server'

/**
 * Regenerates the teacher's ical_token.
 * Invalidates all existing calendar subscriptions immediately.
 */
export async function regenerateCalendarTokenAction(): Promise<void>
// UPDATE teachers SET ical_token = gen_random_uuid() WHERE profile_id = <session user>
// revalidatePath('/teacher/calendar')
```

**Sidebar** — add to teacher section in `Sidebar.tsx`:
```typescript
{ href: '/teacher/calendar', label: 'מנוי ליומן', icon: CalendarDays, roles: ['teacher'] }
```

---

## Story 5 — Parent Portal: Receipt Links

**Scope:** Small surgical change. The portal already shows paid charges. Sprint 15 added `receipt_url` to the `charges` table. This story surfaces that URL in the portal.

**`src/app/portal/[orgId]/payments/page.tsx`** — two changes:

1. **Query:** add `receipt_url` to the `select` clause:
```typescript
.select('id, amount, status, charge_type, payment_link, receipt_url, created_at, paid_at')
```

2. **UI:** In the paid charges list, show a "קבלה" link when `receipt_url` is set:
```tsx
{/* Existing: */}
<span className="text-xs text-green-600 font-medium">שולם</span>

{/* After change: */}
<div className="flex items-center gap-2">
  <span className="text-xs text-green-600 font-medium">שולם</span>
  {c.receipt_url && (
    <a
      href={c.receipt_url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-blue-600 underline"
    >
      קבלה
    </a>
  )}
</div>
```

No new server actions, no schema changes — this story touches exactly one file.

---

## Key Files Changed / Created

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260416000001_message_templates_and_ical.sql` | message_templates table + RLS + teachers.ical_token |
| `src/lib/whatsapp/templates.ts` | DEFAULT_TEMPLATES + resolveTemplate + substituteVars (Next.js) |
| `src/lib/ical/index.ts` | RFC 5545 iCal file generator |
| `supabase/functions/_shared/templates.ts` | Same resolution engine for Deno Edge Functions |
| `src/app/(dashboard)/settings/message-templates/page.tsx` | Template list + edit UI (owner) |
| `src/app/(dashboard)/settings/message-templates/actions.ts` | saveTemplateAction + resetTemplateAction |
| `src/app/api/calendar/[token]/route.ts` | Public iCal endpoint |
| `src/app/(dashboard)/teacher/calendar/page.tsx` | Subscription URL page (teacher) |
| `src/app/(dashboard)/teacher/calendar/actions.ts` | regenerateCalendarTokenAction |

### Modified files

| File | Change |
|------|--------|
| `src/lib/whatsapp/index.ts` | @deprecated comments on old helpers; no code removal yet |
| `src/lib/booking/confirmBooking.ts` | Use resolveTemplate for booking_link + booking_confirmation |
| `src/lib/cancellation-flow/` | Use resolveTemplate for cancellation_confirmation + cancellation_admin_alert |
| `src/lib/receipts/issueReceiptForCharge.ts` | Use resolveTemplate for receipt_notification |
| `src/app/api/whatsapp/webhook/route.ts` | Use resolveTemplate for balance / schedule / portal / unknown intents |
| `supabase/functions/lesson-reminders/index.ts` | Use resolveTemplate from _shared/templates.ts |
| `supabase/functions/payment-reminders/index.ts` | Use resolveTemplate from _shared/templates.ts |
| `supabase/functions/homework-reminders/index.ts` | Use resolveTemplate from _shared/templates.ts |
| `src/app/portal/[orgId]/payments/page.tsx` | Add receipt_url to query + receipt link in UI |
| `src/components/dashboard/Sidebar.tsx` | Add הודעות (owner) + מנוי ליומן (teacher) nav items |
| `src/app/(dashboard)/settings/page.tsx` | Add "הודעות WhatsApp" card |
| `src/proxy.ts` | Add /api/calendar/* to public bypass list |
| `AGENTS.md` | Update implementation status table |

---

## New Env Vars

**None.** `APP_URL` is assumed to already exist (used to construct the portal URL in `/settings/whatsapp`). The iCal URL is built from `APP_URL + /api/calendar/<token>`.

If `APP_URL` is not yet validated in `next.config.ts`, add it to the env validation list in this sprint.

---

## Security Notes

- `message_templates` RLS: read access for all org members (owner, admin, teacher can read); write only for `owner`.
- iCal token: UUID v4 stored in DB. Anyone with the URL can read the teacher's schedule — this is intentional (same model as Google Calendar's "public share link"). Token can be revoked by regenerating.
- iCal endpoint bypasses Supabase session check (added to `proxy.ts` bypass list). The token IS the auth mechanism.
- Custom template body is displayed as plain text in WhatsApp — no HTML injection risk. Still, strip any control characters before sending.
- `resolveTemplate` never logs the resolved message body (may contain PII like parent names). Log only `orgId + type` on success.

---

## Error Handling Rules

1. **Template resolution failure must never block message sending.** If the DB query in `resolveTemplate` throws, catch, log (`[templates] DB error for org ${orgId} type ${type}`), and return the system default string.
2. **iCal endpoint:** If teacher token not found → 404. If lesson query fails → 500 with plain text body (no iCal wrapper). Never return a malformed iCal file.
3. **Template save validation:** If `body_template` is empty after trim → return `{ error: 'תוכן ההודעה לא יכול להיות ריק' }` without writing to DB.
4. **Regenerate token:** If the DB update fails, return an error state — do not redirect. The old token remains valid (no partial state).

---

## What Is NOT in Sprint 16

- **Deleting old WhatsApp send helper functions** (`sendBookingConfirmation`, etc.) — they get `@deprecated` comments now; deletion in Sprint 17 after confirming no remaining call sites.
- **Per-template A/B testing** — out of scope for this product stage.
- **Exporting the template list to JSON** — owner can copy individual templates from the UI.
- **Multi-language templates** — deferred to Sprint 20 (i18n).
- **iCal for parents** — parents have the portal; iCal for parents is Sprint 17+.
- **iCal for admin lesson overview** — out of scope; admin uses the dashboard calendar.
- **Push/WebSub calendar refresh** — standard iCal subscription polling (every 15–60 min) is sufficient; WebSub not needed.
- **WhatsApp template message type (Meta-approved)** — this sprint only customizes the text content; message type remains `type: 'text'`. Meta-approved template messages are Sprint 22.
- **Backfilling receipt_url on historical paid charges** — still deferred to a future admin script.
- **AI assistant (Sprint 19)** — the unknown-intent fallback is now customizable, but the AI fallback itself is not built here.

---

## Architecture After Sprint 16

```
WhatsApp message send flow:
  Call site
    └─ resolveTemplate(orgId, type, vars)          [Next.js: src/lib/whatsapp/templates.ts]
         ├─ DB: SELECT body_template WHERE org + type
         │       → found: use custom template
         │       → not found: use DEFAULT_TEMPLATES[type]
         ├─ substituteVars(template, vars)
         └─ returns resolved string
    └─ sendTextMessage(phone, resolvedBody, token, phoneNumberId)

Edge Function flow:
  Deno cron trigger
    └─ resolveTemplate(supabaseClient, orgId, type, vars)  [_shared/templates.ts]
         └─ same resolution logic
    └─ sendTextMessage(phone, resolvedBody, token, phoneNumberId)  [_shared/whatsapp.ts]

iCal subscription flow:
  Teacher → /teacher/calendar → copy URL
  Calendar app → GET /api/calendar/<uuid>
    └─ lookup teacher by ical_token
    └─ fetch lessons (past 4 weeks + next 6 months, status = 'scheduled')
    └─ generateICalString(...)
    └─ return text/calendar response
```

---

## Decisions Added (for decisions.md)

**Decision — template variable syntax:** `{{variable_name}}` (double braces, no spaces). Rationale: readable for non-technical owners, unambiguous in WhatsApp text, simple to implement with a regex replace. Not Handlebars/Mustache — no control flow, just substitution.

**Decision — iCal token type:** Stored UUID (not signed JWT). Rationale: signed JWT would allow stateless verification, but we want regeneration to immediately invalidate old URLs without waiting for JWT expiry. UUID lookup is one fast indexed query. JWT overhead is not justified here.

**Decision — iCal lookback window:** 4 weeks past + 6 months future. Rationale: teachers occasionally review past lessons; 6-month forward window covers the typical school-year planning horizon without bloating the file.

**Decision — resolveTemplate fallback on DB error:** Always returns system default, never throws. Rationale: a DB glitch during template resolution should never prevent a lesson reminder or payment request from being sent. The message may look generic, but it arrives. Log the error for ops visibility.
