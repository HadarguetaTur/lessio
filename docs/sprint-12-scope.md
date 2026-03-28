# Sprint 12 — Automated Reminders

**Status:** Planned  
**Goal:** Parents receive a WhatsApp reminder before each lesson. Overdue charges trigger an automatic follow-up message. Both are configurable per org and idempotent — no duplicate sends.

---

## Pre-Sprint State

All WhatsApp messages are currently reactive (sent in response to an action: booking, cancellation, payment request). There is no proactive outreach. Parents forget about lessons; unpaid charges age without follow-up. Both cause revenue loss and coordination overhead that humans currently handle manually.

---

## Story 1 — Schema

**`supabase/migrations/20260330000004_reminders.sql`**

```sql
-- Org-level reminder configuration (added to organizations table)
ALTER TABLE organizations
  ADD COLUMN reminders_enabled         boolean NOT NULL DEFAULT true,
  ADD COLUMN lesson_reminder_hours     smallint NOT NULL DEFAULT 24
    CHECK (lesson_reminder_hours IN (2, 4, 12, 24, 48)),
  ADD COLUMN payment_reminder_days     smallint NOT NULL DEFAULT 7
    CHECK (payment_reminder_days > 0 AND payment_reminder_days <= 30);

COMMENT ON COLUMN organizations.reminders_enabled IS 'Master switch: when false, no reminder jobs send for this org.';
COMMENT ON COLUMN organizations.lesson_reminder_hours IS 'Send lesson reminder X hours before start_at.';
COMMENT ON COLUMN organizations.payment_reminder_days IS 'Send payment follow-up after charge has been pending for X days without being paid.';

-- Notification deduplication log
CREATE TABLE notification_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('lesson_reminder', 'payment_reminder')),
  entity_id       uuid NOT NULL,   -- lesson_id or charge_id
  sent_at         timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL CHECK (status IN ('sent', 'failed')) DEFAULT 'sent',
  error_message   text,
  UNIQUE (organization_id, type, entity_id)  -- one send per entity per type
);

COMMENT ON TABLE notification_log IS 'Idempotency log for automated WhatsApp reminders. One row per entity per type ensures no duplicate sends.';

-- Index for Edge Function queries
CREATE INDEX idx_notification_log_lookup ON notification_log(organization_id, type, entity_id);

-- RLS: service-role only (Edge Functions use service role)
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
-- No public policies — only accessible via service role key
```

---

## Story 2 — Reminder Settings Page

**`src/app/(dashboard)/settings/reminders/page.tsx`** (new)

Owner-only. Shows:

| Setting | Control |
|---|---|
| תזכורות מופעלות | Toggle (checkbox) |
| שעות לפני שיעור לתזכורת | Select: 2, 4, 12, 24, 48 שעות לפני |
| ימי פיגור לתזכורת תשלום | Number input (1–30) |

Describes in plain text what each setting does. Shows example message text (non-editable in Sprint 12; custom templates deferred).

**`src/app/(dashboard)/settings/reminders/actions.ts`** (new)

```typescript
const RemindersSchema = z.object({
  reminders_enabled: z.boolean(),
  lesson_reminder_hours: z.coerce.number().refine((v) => [2, 4, 12, 24, 48].includes(v)),
  payment_reminder_days: z.coerce.number().int().min(1).max(30),
})

export async function saveReminderSettings(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState>  // owner-only, updates organizations row
```

**`src/components/dashboard/Sidebar.tsx`** (update)

```typescript
{ href: '/settings/reminders', label: 'תזכורות', icon: Bell, roles: ['owner'] },
```

---

## Story 3 — Edge Function: Lesson Reminders

**`supabase/functions/lesson-reminders/index.ts`** (new Supabase Edge Function)

**Trigger:** Scheduled cron — runs every hour (Supabase cron syntax: `0 * * * *`).

**Algorithm:**

```
1. Fetch all organizations WHERE reminders_enabled = true AND whatsapp_phone_number_id IS NOT NULL
2. For each org:
   a. window_start = now() + lesson_reminder_hours
   b. window_end   = window_start + 1 hour      ← only lessons starting in the next check window
   c. Fetch lessons WHERE:
        organization_id = org.id
        AND status = 'scheduled'
        AND start_at BETWEEN window_start AND window_end
   d. For each lesson:
      i.  Check notification_log: SELECT 1 WHERE org_id=? AND type='lesson_reminder' AND entity_id=lesson.id
      ii. If row exists → skip (already sent)
      iii. Resolve parent phone via lesson_students → students → relationships (is_primary=true) → parents.phone
      iv. Send WhatsApp message (decryptToken(org.whatsapp_access_token))
      v.  INSERT notification_log (status='sent' or 'failed')
```

**WhatsApp message template (Hebrew, hard-coded in Sprint 12):**

```
תזכורת: יש לך שיעור מחר עם [שם מורה] בשעה [שעה] ([תאריך]).
```

(Future: custom templates via `/settings/reminders`.)

**Environment variables used:**
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (standard Edge Function vars)
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` (already in production env)

**Error handling:** Each org/lesson failure is caught individually and logged to `notification_log` with `status='failed'`. One failure does not stop other orgs from being processed.

---

## Story 4 — Edge Function: Payment Reminders

**`supabase/functions/payment-reminders/index.ts`** (new Supabase Edge Function)

**Trigger:** Scheduled cron — runs daily at 09:00 UTC (`0 9 * * *`).

**Algorithm:**

```
1. Fetch all organizations WHERE reminders_enabled = true AND whatsapp_phone_number_id IS NOT NULL
2. For each org:
   a. cutoff = now() - payment_reminder_days
   b. Fetch charges WHERE:
        organization_id = org.id
        AND status = 'pending'
        AND created_at < cutoff
        AND payment_link IS NOT NULL    ← only if a payment link has already been sent
   c. For each charge:
      i.  Check notification_log: type='payment_reminder', entity_id=charge.id
      ii. If row exists → skip
      iii. Fetch parent.phone via charge.parent_id
      iv. Send WhatsApp reminder
      v.  INSERT notification_log
```

**WhatsApp message template:**

```
תזכורת: יש לך חיוב פתוח בסך ₪[סכום]. ניתן לשלם בקישור: [payment_link]
```

**Note:** Only charges that already have a `payment_link` get reminders. Charges without a link (provider not configured, or manual payment expected) are not nagged — to avoid confusing parents about how to pay.

---

## Story 5 — Cron Registration

**`supabase/config.toml`** (update if using Supabase CLI v2 cron syntax) or registered via Supabase dashboard:

```toml
[functions.lesson-reminders]
schedule = "0 * * * *"    # every hour

[functions.payment-reminders]
schedule = "0 9 * * *"    # daily at 09:00 UTC
```

Alternatively documented in `docs/environments.md` as a manual dashboard step if config.toml cron is not yet supported on the deployed Supabase version.

---

## Story 6 — Notification Log UI (Owner View)

**`src/app/(dashboard)/settings/reminders/page.tsx`** (update)

Below the settings form, show the last 20 entries from `notification_log` for this org (server-side query with service role):

| תאריך | סוג | ישות | סטטוס |
|---|---|---|---|
| 28.3.2026 09:00 | תזכורת שיעור | שיעור #abc | נשלח |
| 27.3.2026 09:00 | תזכורת תשלום | חיוב #xyz | נכשל |

Failed entries show the `error_message`. This gives operators visibility without building a full audit log system.

---

## Architecture After Sprint 12

```
Supabase Cron → lesson-reminders (every hour)
  → per org: find lessons in reminder window
    → check notification_log (dedup)
      → WhatsApp lesson reminder to parent
        → notification_log INSERT (sent/failed)

Supabase Cron → payment-reminders (daily 09:00 UTC)
  → per org: find overdue pending charges with payment_link
    → check notification_log (dedup)
      → WhatsApp payment reminder to parent
        → notification_log INSERT (sent/failed)

Owner → /settings/reminders
  → toggle reminders_enabled
  → set lesson_reminder_hours + payment_reminder_days
  → view last 20 notification_log entries
```

---

## What is NOT in Sprint 12

- Custom WhatsApp message templates (messages are hard-coded Hebrew strings)
- Lesson reminders to teachers (only parents in Sprint 12)
- SMS fallback
- Reminder for charges without a payment link
- Multiple reminders per charge (only one follow-up per charge)
- Reminder unsubscribe mechanism for parents
- WhatsApp template approval via Meta Business Manager (uses session/conversational messaging — valid if parent has messaged within 24h; else requires approved template)
