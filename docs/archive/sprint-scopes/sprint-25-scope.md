# Sprint 25 — AI Intelligence + Multi-Channel Communications
*Branch: `sprint-25`*
*Depends on: Sprint 24 complete*

---

## Carry-Over from Sprint 23/24

| Item | Reason |
|---|---|
| Sumit SaaS Billing E2E staging validation (manual checklist) | Not code — requires staging environment with real Sumit credentials. Deferred until staging is provisioned. |

---

## Closed Decisions (pre-sprint)

| Topic | Decision |
|---|---|
| AI provider abstraction | **Adapter pattern** per provider behind a unified `AiProvider` interface. Each adapter exports `chat(systemPrompt, history, userMessage) → string`. The existing OpenAI logic moves into `openai.ts` adapter. |
| API key storage | **Per-org encrypted key** in `organizations.ai_config_encrypted` (AES-256-GCM, same pattern as WhatsApp/payment keys). Platform-level fallback from `OPENAI_API_KEY` env var if org has no key. |
| AI model selection | **Per-org `ai_model` column** — owner picks from a provider-scoped dropdown. Defaults: OpenAI → `gpt-4o-mini`, Anthropic → `claude-haiku-4-5`, Google → `gemini-2.0-flash`. |
| Usage tracking granularity | **Per-request row** in `ai_usage_log` — one row per AI assistant call. Aggregated by day/month in the dashboard query. |
| Satisfaction mechanism | **WhatsApp follow-up message** after AI reply with thumbs-up/thumbs-down. Response recorded via webhook intent detection. No portal UI for satisfaction in v1. |
| Email provider | **Resend** — simple API, generous free tier (3,000 emails/month), React Email compatible. No templating engine needed — use inline HTML. |
| Email opt-in model | **Per notification type toggle** — owner enables/disables email independently for each notification type (lesson_reminder, payment_reminder, homework_assignment, receipt). WhatsApp remains primary. |
| In-app notification persistence | **30-day auto-dismiss** — notifications older than 30 days are deleted by a daily Edge Function. No archive. |
| Notification bell scope | **Per-user (profile_id)** — each dashboard user sees their own notifications. Owner/admin see org-wide events; teacher sees only their own lessons. |

---

## Context: What Was Already Built

| Feature | Status |
|---|---|
| AI assistant with OpenAI gpt-4o-mini, 3-reply/24h safety cap | Done (Sprint 19–20) |
| `conversation_log` table + appendTurn / getRecentHistory / countAssistantReplies | Done (Sprint 19–20) |
| AI settings page (enable/disable toggle + conversation log table) | Done (Sprint 19–20) |
| `buildSystemPrompt.ts` — context-rich Hebrew system prompt from org data | Done (Sprint 19) |
| WhatsApp webhook with intent detection + AI fallback | Done (Sprint 19–20) |
| `OPENAI_API_KEY` in REQUIRED_IN_PRODUCTION env vars | Done (Sprint 19) |
| WhatsApp `sendSmartMessage` with 24h session-window check | Done (Sprint 23) |
| Approved template registry (`src/lib/whatsapp/approvedTemplates.ts`) | Done (Sprint 23) |
| Feature gate: `requireFeature(orgId, 'ai_assistant')` | Done (Sprint 23) |
| Reminder settings page (lesson/payment reminder toggles + hours/days config) | Done (Sprint 12) |
| `notification_log` table for dedup + audit | Done (Sprint 12) |
| Edge Functions: `lesson-reminders`, `payment-reminders`, `homework-reminders` | Done (Sprint 12–14) |
| TopBar with hamburger, breadcrumbs, GlobalSearch, LocaleSwitcher | Done (Sprint 13) |
| AES-256-GCM encryption utility (`src/lib/crypto/`) | Done (Sprint 7) |

---

## Goal

Make the AI assistant provider-agnostic so orgs can use OpenAI, Anthropic, or Google with their own API keys. Add usage tracking and satisfaction scoring so owners can measure AI value. Introduce email as a second notification channel alongside WhatsApp. Wire up an in-app notification center so dashboard users get real-time awareness of important events.

---

## Story 0 — Carry-Over: Sumit E2E Validation

**Not code** — manual validation checklist on staging:

- [ ] Plan selection in onboarding with Sumit test card
- [ ] `organization_subscriptions` row created with correct `status = 'active'`
- [ ] Sumit webhook fires -> `sumit-saas` route updates subscription status
- [ ] `saas-subscription-checker` cron marks expired subscriptions as `past_due`
- [ ] `saas-renewal-reminder` Edge Function sends renewal WhatsApp 7 days before expiry
- [ ] Cancel flow via `/account/billing` sets `cancel_at_period_end = true`

---

## Story 1 — AI Multi-Provider + Key Management

**Why:** Locking orgs into OpenAI limits flexibility and creates single-vendor risk. Some orgs may already have API keys for Anthropic or Google, or prefer specific models for cost or quality reasons.

### 1a — Provider Adapter Interface

- `src/lib/ai-assistant/providers/types.ts` — `AiProvider` interface:
  ```typescript
  interface AiProvider {
    chat(params: {
      systemPrompt: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
      userMessage: string
      maxTokens?: number
      temperature?: number
    }): Promise<{ content: string; promptTokens: number; completionTokens: number }>
  }
  ```
- `src/lib/ai-assistant/providers/openai.ts` — extract existing OpenAI logic into adapter (move from `index.ts`)
- `src/lib/ai-assistant/providers/anthropic.ts` — Anthropic adapter using `@anthropic-ai/sdk`
- `src/lib/ai-assistant/providers/google.ts` — Google adapter using `@google/generative-ai`
- `src/lib/ai-assistant/providers/factory.ts` — `getAiProvider(orgId)`:
  1. Fetch `organizations.ai_provider`, `ai_model`, `ai_config_encrypted`
  2. Decrypt API key if present; fallback to platform env var for OpenAI
  3. Return configured adapter

### 1b — Settings UI

- `/settings/ai-assistant` — extend existing page:
  - Provider dropdown: OpenAI / Anthropic / Google
  - Model dropdown (filtered by selected provider):
    - OpenAI: `gpt-4o`, `gpt-4o-mini`
    - Anthropic: `claude-sonnet-4-6`, `claude-haiku-4-5`
    - Google: `gemini-2.0-flash`, `gemini-2.5-flash`
  - API key input (password field, optional — falls back to platform key for OpenAI)
  - "בדוק חיבור" test button — sends a trivial prompt and displays success/error
  - Save action: encrypt API key → store in `ai_config_encrypted`

### 1c — Refactor `aiAssistant()` Entry Point

- `src/lib/ai-assistant/index.ts` — replace direct OpenAI call with:
  ```typescript
  const provider = await getAiProvider(orgId)
  const result = await provider.chat({ systemPrompt, history, userMessage, maxTokens: 300, temperature: 0.3 })
  ```
- Token counts from provider response → passed to usage logger (Story 2)
- Error classification: map provider-specific errors to common error types (rate_limit, auth_error, server_error)

---

## Story 2 — AI Usage Dashboard

**Why:** Orgs need visibility into AI costs and effectiveness. Without tracking, there's no way to justify the cost or optimize the system.

### 2a — Usage Logging

- DB: `ai_usage_log` table (see Schema Changes)
- After each successful AI call in `aiAssistant()`:
  ```typescript
  await logAiUsage({
    orgId,
    provider: org.ai_provider,
    model: org.ai_model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    estimatedCostUsd: estimateCost(provider, model, promptTokens, completionTokens),
    satisfaction: 'none', // updated later via webhook
  })
  ```
- `src/lib/ai-assistant/costs.ts` — `estimateCost(provider, model, promptTokens, completionTokens)` with known price tiers per model (hardcoded, updated periodically)

### 2b — Usage Dashboard UI

- `/settings/ai-assistant` — new "שימוש" tab (alongside existing settings + conversation log):
  - Monthly summary cards: total requests, total tokens, estimated cost (USD), avg response time
  - Bar chart: daily requests (last 30 days)
  - Resolution rate: AI replies / total incoming WhatsApp messages (percentage)
  - Satisfaction score: positive / (positive + negative) percentage with count
- Data fetched via `src/lib/ai-assistant/usage.ts` — `getUsageSummary(orgId, month)`

### 2c — Satisfaction Tracking

- After AI reply in webhook, send a follow-up WhatsApp message: "האם התשובה עזרה? 👍 / 👎"
- New webhook intent: `ai_satisfaction` — detect thumbs up/down emoji responses
- On detection: update most recent `ai_usage_log` row for that phone → set `satisfaction = 'positive' | 'negative'`
- Settings UI: aggregate satisfaction score displayed as percentage

---

## Story 3 — Email Notifications (Resend)

**Why:** WhatsApp has a 24h session window limitation. Email provides a reliable fallback for notifications outside the window, and some parents prefer email for formal communications like receipts and payment requests.

### 3a — Email Infrastructure

- New dependency: `resend` package
- New env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — add to `REQUIRED_IN_PRODUCTION` in `src/lib/env.ts`
- `src/lib/email/index.ts`:
  ```typescript
  export async function sendEmail(params: {
    to: string
    subject: string
    html: string
    orgName?: string // used in "from" display name
  }): Promise<void>
  ```
- Error handling: log failures, never throw (same pattern as WhatsApp fire-and-forget)

### 3b — Email Templates

- `src/lib/email/templates/` — plain HTML template functions (no React Email in v1):
  - `lessonReminderEmail(vars)` — lesson date, time, teacher name
  - `paymentRequestEmail(vars)` — amount, payment link, description
  - `homeworkAssignmentEmail(vars)` — title, body, due date
  - `receiptEmail(vars)` — amount, receipt URL
  - `homeworkGradedEmail(vars)` — title, score, feedback
- Each returns `{ subject: string; html: string }`
- Bilingual: detect locale from parent's `preferred_locale` or org default

### 3c — Settings + Per-Type Toggle

- DB: `organizations.email_notifications` — JSONB column storing enabled types:
  ```json
  { "lesson_reminder": true, "payment_reminder": true, "homework_assignment": false, "receipt": true }
  ```
- `/settings/reminders` — extend existing page:
  - Per notification type row: WhatsApp toggle + Email toggle side by side
  - Email requires parent to have `email` field populated (show count of parents with/without email)
- `src/lib/email/shouldSendEmail(orgId, type, parentEmail)` — checks org toggle + parent has email

### 3d — Wire Into Existing Flows

- Edge Functions (`lesson-reminders`, `payment-reminders`, `homework-reminders`):
  - After WhatsApp send, check if email enabled for type → call email sender
  - Email sent as parallel channel (not fallback — both channels fire if enabled)
- Server actions (`markAsPaid` → receipt, `gradeSubmission` → graded notification):
  - Same pattern: fire-and-forget email alongside WhatsApp
- Parent email field: add `email` column to `parents` table if not already present; update parent forms

---

## Story 4 — In-App Notification Center

**Why:** Dashboard users (owner, admin, teacher) need real-time awareness of important events without checking individual pages. A notification bell provides a centralized inbox.

### 4a — Notification Infrastructure

- DB: `in_app_notifications` table (see Schema Changes)
- `src/lib/notifications/index.ts`:
  ```typescript
  export async function createNotification(params: {
    orgId: string
    recipientProfileId: string
    type: NotificationType
    title: string
    body?: string
    actionUrl?: string
  }): Promise<void>

  export type NotificationType =
    | 'lesson_cancelled'
    | 'payment_received'
    | 'homework_submitted'
    | 'student_at_risk'
    | 'new_lead'
    | 'goal_achieved'
  ```
- `getNotifications(profileId, orgId, { unreadOnly?, limit? })` — fetch with cursor pagination
- `markAsRead(notificationId)` / `markAllRead(profileId, orgId)`

### 4b — Notification Triggers

Wire `createNotification()` into existing flows (fire-and-forget, never blocking):

| Event | Recipient(s) | Type | Action URL |
|---|---|---|---|
| Lesson cancelled by parent | Owner + teacher | `lesson_cancelled` | `/lessons/{id}` |
| Charge marked as paid | Owner | `payment_received` | `/charges/{id}` |
| Homework submitted by student | Teacher (of assignment) | `homework_submitted` | `/homework/{id}` |
| Student flagged at-risk (reports) | Owner | `student_at_risk` | `/students/{id}` |
| New lead captured | Owner + admin | `new_lead` | `/leads/{id}` |
| Goal achieved | Owner + teacher | `goal_achieved` | `/students/{id}?tab=notes` |

### 4c — Bell Icon + Drawer UI

- `src/components/dashboard/NotificationBell.tsx` — client component:
  - Bell icon with unread count badge (red circle with number)
  - Click → slide-out drawer from the right
  - Notification list: icon per type, title, body preview, relative time ("לפני 5 דקות")
  - Click notification → navigate to `action_url` + mark as read
  - "סמן הכל כנקרא" button at top
  - Empty state: "אין התראות חדשות"
- Insert into TopBar (existing `<div className="flex shrink-0 items-center gap-2">`)
- Polling: fetch unread count every 60 seconds (no WebSocket in v1)

### 4d — Cleanup Edge Function

- `supabase/functions/notification-cleanup/index.ts` — daily cron at 04:00 UTC
- Deletes `in_app_notifications` older than 30 days
- Register in `supabase/config.toml`

---

## Schema Changes

```sql
-- Story 1: AI multi-provider columns
ALTER TABLE organizations
  ADD COLUMN ai_provider         text NOT NULL DEFAULT 'openai'
    CHECK (ai_provider IN ('openai', 'anthropic', 'google')),
  ADD COLUMN ai_model            text NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN ai_config_encrypted text; -- AES-256-GCM encrypted API key

-- Story 2: AI usage tracking
CREATE TABLE ai_usage_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date              date NOT NULL DEFAULT CURRENT_DATE,
  provider          text NOT NULL,
  model             text NOT NULL,
  prompt_tokens     int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  satisfaction      text NOT NULL DEFAULT 'none'
    CHECK (satisfaction IN ('positive', 'negative', 'none')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_ai_usage_log"
  ON ai_usage_log AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX idx_ai_usage_log_org_date
  ON ai_usage_log (organization_id, date);

-- Story 3: Email notification settings
ALTER TABLE organizations
  ADD COLUMN email_notifications jsonb NOT NULL DEFAULT '{}';
-- Values: { "lesson_reminder": true, "payment_reminder": true, ... }

-- Story 3: Parent email column (if not already present)
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS email text;

-- Story 4: In-app notification center
CREATE TABLE in_app_notifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  title                text NOT NULL,
  body                 text,
  action_url           text,
  read_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_in_app_notifications"
  ON in_app_notifications AS RESTRICTIVE
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE INDEX idx_notifications_recipient
  ON in_app_notifications (recipient_profile_id, read_at)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_cleanup
  ON in_app_notifications (created_at);
```

**Migration file:** `supabase/migrations/20260502000001_sprint25_ai_email_notifications.sql`

---

## New Dependencies

| Package | Version | Story | Purpose |
|---|---|---|---|
| `resend` | `^4.x` | 3 | Email delivery API |
| `@anthropic-ai/sdk` | `^0.39` | 1 | Anthropic Claude API adapter |
| `@google/generative-ai` | `^0.21` | 1 | Google Gemini API adapter |

---

## New Env Vars

| Var | Required | Story | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | REQUIRED_IN_PRODUCTION | 3 | Resend API key for email delivery |
| `RESEND_FROM_EMAIL` | REQUIRED_IN_PRODUCTION | 3 | Sender email address (e.g., `noreply@lessio.app`) |

Add both to `src/lib/env.ts` `REQUIRED_IN_PRODUCTION` array.

---

## Files to Create

| File | Story |
|---|---|
| `supabase/migrations/20260502000001_sprint25_ai_email_notifications.sql` | All |
| `src/lib/ai-assistant/providers/types.ts` | 1a |
| `src/lib/ai-assistant/providers/openai.ts` | 1a |
| `src/lib/ai-assistant/providers/anthropic.ts` | 1a |
| `src/lib/ai-assistant/providers/google.ts` | 1a |
| `src/lib/ai-assistant/providers/factory.ts` | 1a |
| `src/lib/ai-assistant/costs.ts` | 2a |
| `src/lib/ai-assistant/usage.ts` | 2b |
| `src/lib/email/index.ts` | 3a |
| `src/lib/email/templates/lessonReminder.ts` | 3b |
| `src/lib/email/templates/paymentRequest.ts` | 3b |
| `src/lib/email/templates/homeworkAssignment.ts` | 3b |
| `src/lib/email/templates/receipt.ts` | 3b |
| `src/lib/email/templates/homeworkGraded.ts` | 3b |
| `src/lib/notifications/index.ts` | 4a |
| `src/components/dashboard/NotificationBell.tsx` | 4c |
| `supabase/functions/notification-cleanup/index.ts` | 4d |

---

## Files to Modify

| File | Change |
|---|---|
| `src/lib/ai-assistant/index.ts` | Replace direct OpenAI call with provider factory |
| `src/app/(dashboard)/settings/ai-assistant/page.tsx` | Add provider/model selectors, API key input, test button, usage tab |
| `src/app/(dashboard)/settings/ai-assistant/actions.ts` | Add saveAiProviderAction, testAiConnectionAction |
| `src/app/(dashboard)/settings/reminders/page.tsx` | Add email toggle per notification type |
| `src/app/(dashboard)/settings/reminders/actions.ts` | Save email_notifications JSONB |
| `src/app/api/whatsapp/webhook/route.ts` | Add `ai_satisfaction` intent detection |
| `src/lib/env.ts` | Add RESEND_API_KEY + RESEND_FROM_EMAIL to REQUIRED_IN_PRODUCTION |
| `src/components/dashboard/TopBar.tsx` | Insert NotificationBell component |
| `supabase/functions/lesson-reminders/index.ts` | Add email send after WhatsApp |
| `supabase/functions/payment-reminders/index.ts` | Add email send after WhatsApp |
| `supabase/functions/homework-reminders/index.ts` | Add email send after WhatsApp |
| `src/app/(dashboard)/homework/[id]/actions.ts` | Fire-and-forget email on grade |
| `src/app/(dashboard)/charges/actions.ts` | Fire-and-forget email on receipt |
| `supabase/config.toml` | Register `notification-cleanup` daily cron |
| `messages/he.json` | Add `ai.*`, `email.*`, `notifications.*` namespaces |
| `messages/en.json` | Same English keys |

---

## Acceptance Criteria

- [ ] Owner can select AI provider (OpenAI / Anthropic / Google) and model from settings
- [ ] Owner can paste their own API key; it is encrypted and stored securely
- [ ] "Test connection" button validates provider + model + key and shows success/error
- [ ] AI assistant works with all 3 providers (same quality of response)
- [ ] AI usage dashboard shows monthly tokens, estimated cost, and satisfaction score
- [ ] After AI reply, follow-up satisfaction prompt is sent; response is tracked
- [ ] Owner can enable/disable email per notification type in reminder settings
- [ ] Lesson/payment/homework reminders send email alongside WhatsApp when enabled
- [ ] Receipt and grading notifications send email when enabled
- [ ] Bell icon shows unread notification count; drawer lists notifications
- [ ] Clicking a notification navigates to the relevant page and marks it as read
- [ ] "Mark all read" clears all unread notifications
- [ ] Notifications older than 30 days are auto-deleted by cleanup Edge Function
- [ ] All new UI is i18n-ready (Hebrew + English)
- [ ] All new tables have RLS enabled with deny policies
- [ ] All mutations use service role via `src/lib/supabase/service-role.ts`
- [ ] `npm run build` succeeds; `npm test` passes 100%

---

## Out of Scope

- WebSocket / real-time push for notifications (polling in v1)
- React Email rendering (plain HTML templates in v1)
- Email delivery tracking / open rates
- Parent notification preferences in portal (owner controls all)
- AI streaming responses
- AI function calling / tool use
- SMS as a notification channel
- Custom AI system prompt editing by owner
- AI assistant for languages other than Hebrew
- Email verification for parent email addresses
- Notification grouping / threading
