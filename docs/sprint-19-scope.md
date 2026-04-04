# Sprint 19 — AI WhatsApp Assistant

*Status: Planned*
**Branch:** `sprint-19`
**Depends on:** Sprint 18 complete

**Goal:** When no known intent is matched in the WhatsApp webhook, an AI assistant answers the parent contextually and naturally — dramatically reducing admin support overhead without any human intervention.

---

## Pre-Sprint State

After Sprint 18 the platform handles 5 known intents in the webhook:
- cancellation flow
- balance query
- schedule query
- portal link request
- homework reply ("סיימתי")

Anything outside those falls through to a generic "לא הצלחתי להבין" fallback. In practice this means admins field a large number of repeated questions (lesson times, holiday schedule, payment status) manually via WhatsApp.

---

## Scope Summary

- `conversation_log` DB table — stores multi-turn context + enables review
- `organizations.ai_assistant_enabled` toggle
- `aiAssistant()` lib function — builds context-rich system prompt, calls OpenAI, returns text
- Webhook integration — fallback path calls `aiAssistant()` when enabled
- Safety guard — max 3 AI replies per 24-hour conversation window; after limit sends a human-redirect message
- Dashboard: `/settings/ai-assistant` — enable toggle + conversation log viewer (last 50 entries)
- Sidebar: "עוזר AI" nav item for owner (settings section)

---

## Architectural Decisions (Locked)

1. **Model:** OpenAI `gpt-4o-mini`. Cheap, fast, sufficient for FAQ-style replies. Model is platform-wide (not per org) for now.
2. **API key:** `OPENAI_API_KEY` is a single platform-level env var. Not per-org in Sprint 19.
3. **Context window:** Fetch last 10 conversation turns from `conversation_log` for this phone number, within the last 24 hours. Older context is dropped.
4. **No tool use / function calling.** The assistant can only produce text replies. It cannot create lessons, cancel lessons, process payments, or look up data it wasn't given in the system prompt.
5. **Safety cap:** If the `conversation_log` already contains ≥ 3 `assistant` rows for this phone in the last 24 hours, skip AI and send the human-redirect message instead. This prevents runaway spend and infinite loops.
6. **Structured logging:** Every call logged with `org_id`, `phone`, `prompt_tokens`, `completion_tokens`, model used.
7. **Opt-in per org:** `ai_assistant_enabled` defaults to `false`. Owner must explicitly enable. The fallback message is still sent when disabled.
8. **Supabase RLS:** `conversation_log` rows are org-scoped. The dashboard query uses the service role (same pattern as all other sensitive reads).

---

## Story 0 — Schema

**`supabase/migrations/20260418000001_ai_assistant.sql`** (new)

```sql
-- Opt-in toggle per org
ALTER TABLE organizations
  ADD COLUMN ai_assistant_enabled boolean NOT NULL DEFAULT false;

-- Multi-turn conversation storage
CREATE TABLE conversation_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       uuid        REFERENCES parents(id),
  phone           text        NOT NULL,   -- E.164, for non-parent callers too
  role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_log_org_phone ON conversation_log (organization_id, phone, created_at DESC);
CREATE INDEX idx_conversation_log_org_created ON conversation_log (organization_id, created_at DESC);
```

**RLS:**
- `conversation_log`: org-scoped read for `owner` + `admin` (select where `organization_id = current_org()`). Insert via service role only (webhook server action).

**Files changed:**
- `supabase/migrations/20260418000001_ai_assistant.sql`

---

## Story 1 — AI Assistant Library

**`src/lib/ai-assistant/index.ts`** (new)

Core function:

```typescript
export async function aiAssistant(
  orgId: string,
  phone: string,
  incomingMessage: string
): Promise<string>
```

### Steps inside `aiAssistant()`:

**1. Check safety cap**
- Query `conversation_log` for `role = 'assistant'` entries for this `(org_id, phone)` in the last 24 hours
- If count ≥ 3 → return the human-redirect string immediately (no OpenAI call)

**2. Build system prompt**
Fetch from DB (service role):
- Org: `name`, `timezone`
- Parent: `full_name`, their student names + grade info (via `relationships`)
- Upcoming lessons: next 3 scheduled lessons with date, time, teacher name, student name
- Outstanding balance: sum of pending charges
- Org holidays in next 30 days

System prompt format (Hebrew):
```
אתה עוזר AI של [org_name]. ענה תמיד בעברית בגובה העיניים.

מידע על הלקוח:
- שם: [parent_name]
- תלמידים: [student names]
- שיעורים קרובים: [list]
- יתרה לתשלום: ₪[amount]

כללים:
- ענה רק על שאלות הקשורות ל[org_name]
- אל תיצור, תבטל, או תשנה שיעורים
- אל תבטיח הנחות או שינויי מדיניות
- אם השאלה מחוץ לתחום שלך, הפנה לצוות
```

**3. Fetch conversation history**
- Last 10 turns from `conversation_log` for this `(org_id, phone)` within 24 hours
- Format as OpenAI `messages` array (`role: 'user' | 'assistant'`)

**4. Call OpenAI**
```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: incomingMessage },
  ],
  max_tokens: 300,
  temperature: 0.3,
})
```

**5. Log the exchange**
- Insert `role: 'user'` row (incoming message)
- Insert `role: 'assistant'` row (AI reply)
- Log structured: `{ org_id, phone, prompt_tokens, completion_tokens }`

**6. Return the reply string**

### Human-redirect message (when safety cap hit or AI disabled)
```
לא הצלחתי לענות על השאלה שלך. אנא פנה/י ישירות לצוות בית הספר לסיוע.
```

**Files created:**
- `src/lib/ai-assistant/index.ts`
- `src/lib/ai-assistant/buildSystemPrompt.ts` (separate, testable)
- `src/lib/ai-assistant/conversationLog.ts` (DB read/write helpers)

**New dependency:**
- `openai ^4.x` — official OpenAI Node SDK

---

## Story 2 — Webhook Integration

**`src/app/api/whatsapp/webhook/route.ts`** (update)

The current fallback block:
```typescript
// unknown intent
await sendTextMessage(accessToken, phoneNumberId, from, resolveTemplate(...))
```

Replace with:
```typescript
// unknown intent — try AI assistant if enabled
const org = await getOrgById(orgId) // already fetched earlier in the handler
if (org.ai_assistant_enabled) {
  const reply = await aiAssistant(orgId, from, body)
  await sendTextMessage(accessToken, phoneNumberId, from, reply)
} else {
  await sendTextMessage(accessToken, phoneNumberId, from, resolveTemplate(...))
}
```

**Error handling:** If `aiAssistant()` throws (OpenAI down, timeout), catch and fall back to the generic unknown-intent template. **Never crash the webhook.**

**Files changed:**
- `src/app/api/whatsapp/webhook/route.ts`

---

## Story 3 — Settings Page

**`src/app/(dashboard)/settings/ai-assistant/page.tsx`** (new)

Owner-only page with two sections:

### Section 1 — Enable toggle
- `Switch` component (shadcn)
- Server action: `saveAiAssistantSettings(formData)` — updates `organizations.ai_assistant_enabled`
- Note text explaining what the feature does + cost implications

### Section 2 — Conversation log
- Table: last 50 rows from `conversation_log` for this org
- Columns: time, phone (masked: `05X****XXX`), role (user/assistant), message (truncated to 100 chars)
- "הצג הכל" expand button per row (client side)
- No delete functionality in Sprint 19

**Files created:**
- `src/app/(dashboard)/settings/ai-assistant/page.tsx`
- `src/app/(dashboard)/settings/ai-assistant/actions.ts`
- `src/components/dashboard/settings/ConversationLogTable.tsx`

---

## Story 4 — Sidebar + Settings Landing Page

Add "עוזר AI" nav item to the Settings section in the sidebar (owner only).

Update `src/app/(dashboard)/settings/page.tsx` to add an AI Assistant settings card.

**Files changed:**
- `src/components/dashboard/Sidebar.tsx`
- `src/app/(dashboard)/settings/page.tsx`

---

## New Dependencies

- `openai ^4.x` — OpenAI Node SDK (installed via npm)

---

## New Env Vars

- `OPENAI_API_KEY` — platform-level. Added to `REQUIRED_IN_PRODUCTION` in `src/lib/env.ts` (not `ALWAYS_REQUIRED` — dev can run without AI enabled).

Update `.env.local.example` with instructions.

---

## Suggested Delivery Order

1. Story 0: schema migration
2. Story 1: `aiAssistant()` lib (most testable, core logic)
3. Story 2: webhook integration
4. Story 3: settings page (toggle + log viewer)
5. Story 4: sidebar + settings card

---

## Test Plan

### Automated

- Unit test: `buildSystemPrompt()` — snapshot test with known org/parent/lesson data
- Unit test: `aiAssistant()` safety cap logic — mock DB returning ≥ 3 assistant rows → returns human-redirect without calling OpenAI
- Unit test: `aiAssistant()` when `ai_assistant_enabled = false` is checked at webhook level
- Unit test: webhook error path — OpenAI throws → fallback message sent, no crash
- Integration smoke: `conversationLog` insert/fetch helpers (mocked DB)

### Manual QA

1. Enable AI assistant in `/settings/ai-assistant`
2. Send an unknown-intent message via WhatsApp → AI replies contextually
3. Send 3 more messages → 4th gets human-redirect (safety cap)
4. Disable AI → unknown-intent falls back to generic template
5. Conversation log shows all turns correctly

---

## Security Notes

- `OPENAI_API_KEY` is server-only. Never rendered in client bundles.
- Phone numbers in `conversation_log` are stored in full (E.164) for functionality but masked in the dashboard UI.
- The AI cannot perform any DB mutations — it only reads context data and returns text.
- Max 300 tokens in completion prevents extremely long (and expensive) replies.
- `conversation_log` RLS: parents cannot read their own log via the anon client.

---

## Out of Scope

- Per-org OpenAI key (Sprint 19 is platform-level only)
- AI for email/SMS channels
- AI training on org-specific data (RAG / embeddings)
- Arabic language support (Sprint 22)
- AI for admin queries (chat with your data) — separate future feature
- Function calling / tool use (AI cannot take actions)
- Conversation handoff to human agent (Intercom-style) — future
- Cost tracking / usage billing to org
