# Sprint 20 — AI Assistant + WhatsApp Hardening

*Status: Planned*
**Branch:** `sprint-20`
**Depends on:** Sprint 19 complete

**Goal:** Close the AI assistant release safely before any internationalization work begins. Sprint 19 delivered the schema, helpers, and AI library — but the webhook handler does not yet call the idempotency layer, several WhatsApp paths have silent dead-ends, and the AI runtime has no guard against a missing or invalid API key. This sprint closes those gaps with targeted code changes and regression tests.

---

## Pre-Sprint State

After Sprint 19:

| Layer | State |
|---|---|
| `whatsapp_processed_messages` table | ✅ Created (migration `20260418000002`) |
| `claimIncomingMessage` / `releaseIncomingMessageClaim` | ✅ Implemented in `src/lib/whatsapp/idempotency.ts` |
| `aiAssistant()` safety cap + OpenAI call | ✅ Implemented in `src/lib/ai-assistant/index.ts` |
| `conversation_log` DB write (user + assistant turns) | ⬜ Not yet called from webhook handler |
| Webhook calls `claimIncomingMessage` at entry | ⬜ Not yet wired |
| Webhook calls `releaseIncomingMessageClaim` on retryable failure | ⬜ Not yet wired |
| AI enable guard (API key present) | ⬜ Missing |
| Silent dead-ends (no-student path, unknown-phone in intents) | ⬜ Remaining |
| Regression tests for idempotency + retry paths | ⬜ Missing |

---

## Scope

| Story | Description |
|---|---|
| 1 | Webhook idempotency: wire `claim` / `release` into route handler |
| 2 | Conversation log write: insert user + assistant turns from webhook |
| 3 | Silent dead-end removal: respond on no-student and other silent exits |
| 4 | AI runtime hardening: API key guard in settings action + runtime fallback |
| 5 | Regression tests: idempotency, retry, conversation log, fallback paths |

No schema changes required — all tables and helpers exist from Sprint 19.

---

## Story 1 — Webhook Idempotency Integration

**`src/app/api/whatsapp/webhook/route.ts`** (update)

At the top of the per-message processing block (after org lookup and signature verification, before any intent processing):

```typescript
// Claim the message for processing. Returns false if already claimed.
const claimed = await claimIncomingMessage(org.id, messageId, from)
if (!claimed) {
  // Already processed — return 200 so Meta stops retrying.
  return NextResponse.json({ status: 'duplicate' })
}
```

On any **retryable** failure (DB errors, token decryption failures, unexpected throws):

```typescript
} catch (err) {
  console.error('[webhook] Retryable failure — releasing message claim', { orgId, messageId, err })
  await releaseIncomingMessageClaim(org.id, messageId)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}
```

**What NOT to release:** On permanent/expected exits (unknown org, signature invalid, unrecognised message type) the claim should remain so Meta retries do not cause duplicate processing.

**Files changed:**
- `src/app/api/whatsapp/webhook/route.ts`

---

## Story 2 — Conversation Log Write

**`src/lib/ai-assistant/conversationLog.ts`** (update)

Add an `appendTurn()` helper:

```typescript
export async function appendTurn(
  orgId: string,
  phone: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  content: string
): Promise<void>
```

**`src/app/api/whatsapp/webhook/route.ts`** (update, same file as Story 1)

In the AI fallback path, after `aiAssistant()` returns successfully:

```typescript
// Log both sides of the exchange
await appendTurn(org.id, from, parentId, 'user', body)
await appendTurn(org.id, from, parentId, 'assistant', reply)
```

If `appendTurn` throws, catch and log — never let a log write crash the webhook response.

**Files changed:**
- `src/lib/ai-assistant/conversationLog.ts`
- `src/app/api/whatsapp/webhook/route.ts`

---

## Story 3 — Silent Dead-End Removal

The following webhook paths currently log a warning and return `200` without sending any message to the parent. Each should be replaced with a helpful WhatsApp reply.

### 3.1 — Known phone, no linked student

When a parent is found by phone number but has no active `relationships` record:

```typescript
// Before (silent):
console.warn('[webhook] Parent has no linked students', { orgId, parentId })
return NextResponse.json({ status: 'ok' })

// After:
await sendTextMessage(accessToken, phoneNumberId, from,
  resolveTemplate(org.id, 'unknown_intent', {}))
return NextResponse.json({ status: 'ok' })
```

### 3.2 — Self-service intents with unresolvable parent

The balance/schedule/receipt intents currently bail silently if the parent can't be resolved. Replace silent exit with the `unknown_intent` fallback template.

### 3.3 — WhatsApp token decryption failure

If `decryptAccessToken()` throws, the handler currently returns `500`. This causes Meta to retry indefinitely. Change to:
- Log the error with `org_id`
- Return `200` (ack to Meta, prevent retry spam)
- Do NOT release the claim (this is a permanent config error, not a transient failure)

**Files changed:**
- `src/app/api/whatsapp/webhook/route.ts`

---

## Story 4 — AI Runtime Hardening

### 4.1 — API key guard in `saveAiAssistantSettings`

**`src/app/(dashboard)/settings/ai-assistant/actions.ts`** (update)

Before enabling the AI assistant, verify the runtime key is configured:

```typescript
if (enabled && !process.env.OPENAI_API_KEY) {
  return { error: 'OPENAI_API_KEY is not configured on this platform. Contact the platform administrator.' }
}
```

This prevents owners from enabling a feature that cannot function.

### 4.2 — Runtime error classification in `aiAssistant()`

**`src/lib/ai-assistant/index.ts`** (update)

Currently, any OpenAI throw propagates up to the webhook catch block, which calls `releaseIncomingMessageClaim`. That is the correct path — but the error logging should distinguish error types:

```typescript
} catch (err) {
  if (err instanceof OpenAI.APIError) {
    console.error('[ai-assistant] OpenAI API error', {
      orgId, phone,
      status: err.status,    // 429 = rate limit, 401 = bad key, 5xx = OpenAI down
      message: err.message,
    })
  } else {
    console.error('[ai-assistant] Unexpected error', { orgId, phone, err })
  }
  throw err  // re-throw so webhook handler can release claim
}
```

### 4.3 — Settings page warning

**`src/app/(dashboard)/settings/ai-assistant/page.tsx`** (update)

If `ai_assistant_enabled = true` but the platform has no `OPENAI_API_KEY`, show an amber warning banner: "AI is enabled but the platform API key is not configured — messages will fall back to the standard reply."

Use a server-side check: `const hasKey = !!process.env.OPENAI_API_KEY`.

**Files changed:**
- `src/app/(dashboard)/settings/ai-assistant/actions.ts`
- `src/lib/ai-assistant/index.ts`
- `src/app/(dashboard)/settings/ai-assistant/page.tsx`

---

## Story 5 — Regression Tests

### `src/lib/whatsapp/idempotency.test.ts` (new)

- `claimIncomingMessage`: new message → returns `true`, inserts row
- `claimIncomingMessage`: duplicate message_id → returns `false`, no throw
- `claimIncomingMessage`: DB error (non-duplicate) → throws
- `releaseIncomingMessageClaim`: success → deletes row silently
- `releaseIncomingMessageClaim`: DB error → logs error, does not throw

### `src/app/api/whatsapp/webhook/webhook.test.ts` (update)

- Already-claimed message (duplicate) → returns `200` with `{ status: 'duplicate' }`, no intent processing
- Successful processing → claim remains in DB (not released)
- DB failure mid-processing → `releaseIncomingMessageClaim` called, returns `500`
- Token decryption failure → `200` returned, claim NOT released, error logged

### `src/lib/ai-assistant/aiAssistant.test.ts` (update)

- `saveAiAssistantSettings` with `enabled: true` when `OPENAI_API_KEY` absent → returns error, does not write to DB
- OpenAI `APIError` (status 429) → error logged with status code, rethrown
- `appendTurn` throw → caught at webhook level, reply still sent

### `src/lib/ai-assistant/conversationLog.test.ts` (new)

- `appendTurn` inserts correct `role` and `content`
- `appendTurn` DB failure → error logged, does not throw (fire-and-forget contract)
- `countAssistantReplies` returns correct count within 24h window
- `getRecentHistory` returns turns in ascending order, limited to 10, within 24h

**Files created:**
- `src/lib/whatsapp/idempotency.test.ts`
- `src/lib/ai-assistant/conversationLog.test.ts`

**Files changed:**
- `src/app/api/whatsapp/webhook/webhook.test.ts`
- `src/lib/ai-assistant/aiAssistant.test.ts`

---

## Retention Policy (Decision)

`conversation_log` and `whatsapp_processed_messages` are kept indefinitely in Sprint 20.

**Rationale:**
- `conversation_log`: needed for support review, future fine-tuning, and debugging AI quality during rollout.
- `whatsapp_processed_messages`: needed for correct deduplication across server restarts and deployments.

Automated pruning (e.g., anonymize turns older than 90 days, expire processed-message rows after 7 days) is explicitly deferred to the data-retention workstream that will be implemented before the international launch sprint.

---

## Delivery Order

1. Story 1: webhook idempotency wiring (most critical for reliability)
2. Story 2: conversation log write (completes the AI loop)
3. Story 5 (partial): idempotency tests + conversation log tests
4. Story 3: silent dead-end removal
5. Story 4: AI runtime hardening
6. Story 5 (remaining): webhook + AI tests

---

## Test Plan

### Automated

All tests listed in Story 5. Running `npm test` must pass 100% before the sprint is closed.

### Manual QA

1. Send a WhatsApp message with AI enabled → check `conversation_log` has both user + assistant rows
2. Send the same Meta `message_id` twice (simulate retry) → second call returns 200, no duplicate DB writes, no second reply sent
3. Enable AI assistant with no `OPENAI_API_KEY` set → settings action returns error, toggle stays off
4. Enable AI with key set → no warning banner
5. Enable AI with key set, then unset key (simulate misconfiguration) → amber warning banner appears on settings page
6. Send message with parent found but no linked student → parent receives unknown-intent reply (not silence)

---

## Out of Scope

- Automated `conversation_log` pruning (deferred to data-retention sprint)
- Per-org OpenAI key (Sprint 19 decision: platform-level only for MVP)
- Conversation handoff to human agent (future feature)
- AI quality metrics / cost dashboard (future)
- i18n / English UI (deferred — this sprint ships first; i18n is next)
- WhatsApp Template Messages (Meta-approved) — Sprint 22

---

## Next Sprint After This

Once Sprint 20 exit criteria are met, the next sprint is **i18n Infrastructure + English** (previously planned as Sprint 20 in the roadmap — sprint numbers shift by 1 downstream).

Exit criteria checklist:
- [ ] All unknown-intent and self-service WhatsApp flows either reply or remain retryable
- [ ] Duplicate Meta webhook deliveries return 200 without double-processing
- [ ] AI cannot be newly enabled when `OPENAI_API_KEY` is absent
- [ ] `conversation_log` populated correctly for every AI exchange
- [ ] `npm test` passes 100%
- [ ] Manual QA checklist above completed on staging
