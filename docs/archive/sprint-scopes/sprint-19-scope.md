# Sprint 19 — AI WhatsApp Assistant

*Status: Planned*
**Branch:** `sprint-19`
**Depends on:** Sprint 18 complete

**Goal:** When no known intent is matched in the WhatsApp webhook, an AI assistant answers the parent contextually and naturally — dramatically reducing admin support overhead without any human intervention.

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
