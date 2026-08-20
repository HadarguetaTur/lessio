# Sprint 31 — WhatsApp Production Launch

**Status:** 📝 Planned
**Depends on:** Sprint 30 Stories 1–2 (payments/renewals) can run in parallel; this sprint **absorbs and supersedes** Sprint 30 Story 3 (WhatsApp WIP) and the WhatsApp parts of Story 4 (4c webhook rate limit, 4d unknown `phone_number_id`)
**Source:** Full WhatsApp end-to-end audit, 2026-08-14 (code + docs; every finding below was verified against the current code)

**Goal:** An end customer connects their WhatsApp number via `/settings/whatsapp` and the bot works in production — inbound intents, outbound reminders, cold-start OTP. Close the code gaps, then execute the Meta-side onboarding (Business App, App Review, templates) which is the long pole and starts on day one.

---

## Closed Decisions

- **`from_phone` bug is fixed in code, not by migration.** The real column on `whatsapp_processed_messages` is `phone` (migration `20260418000002`); the working webhook claim path already inserts with `phone`. Renaming the column would break live idempotency inserts mid-deploy. Three broken read sites get fixed instead.
- **`waba_id` becomes required** in `saveWhatsAppConnection`. A connection without it is "deaf" (no `subscribed_apps`, no templates) — exactly the failure mode commit `887a652` was meant to eliminate. Fail the save with a Hebrew error rather than persist a broken connection.
- **Portal OTP gets a dedicated AUTHENTICATION template + sender**, not `sendSmartMessage` — auth templates have a fixed Meta-generated body and a dual body+button parameter shape that doesn't fit the `MessageTemplateType` vars model. Text fallback remains during rollout.
- **Group lessons are not cancellable via the bot** (conservative product call): today `executeCancellation` cancels the whole lesson and charges only the requesting parent. Single-participation cancellation is out of scope.
- **Dunning stays opt-in** (`automation_dunning_enabled` defaults `false`). Enforcing it in `payment-reminders` is a behavior change for existing orgs — call it out in release notes; orgs enable it in `/settings/whatsapp`.
- **Rate limiting is DB-based** (sliding-window count on `whatsapp_processed_messages`), no new infra — carried over from Sprint 30's decision.
- Execution order: Story 0 → 1 → 2 → 3 → 4 → 5 → 6. Stories 0–2 have no migrations and ship as one PR train; Stories 4 and 5 each carry a migration and ship as separate PRs. Story 5 may slip. The Meta runbook (bottom) runs in parallel from day one.

---

## Story 0 — Critical Correctness Fixes 🔴 (S, no migrations)

### 0a: `from_phone` / `id` column bug (breaks the 24h session window AND PII anonymization)
`whatsapp_processed_messages` has columns `(organization_id, message_id, phone, created_at)` — there is no `from_phone` and no `id`. Today `isInSessionWindow` always errors → "assume closed" → every smart send takes the template path; and `data-retention` silently fails to anonymize.
- `src/lib/whatsapp/sendSmart.ts:75-76` — `.eq('from_phone', phone)` → `.eq('phone', phone)`; `.select('id')` → `.select('message_id')`
- `supabase/functions/_shared/whatsapp.ts:121-124` — same two fixes in the Deno mirror
- `supabase/functions/data-retention/index.ts:89,92` — `from_phone` → `phone` in both the update and the filter (fixes GDPR anonymization; anonymized rows become `phone='***'`, which can never match a real E.164 number in the session-window query — no interaction)
- **Tests:** new `src/lib/whatsapp/sendSmart.test.ts` — (a) query filters on `phone` / selects `message_id` (regression pin); (b) row within 24h → `sendTextMessage`; (c) no row → `sendTemplateMessage`; (d) no approved template → text fallback; (e) DB error → assume-closed template path

### 0b: Node↔Deno template registry sync (Sprint 30 Story 3 carryover)
- `supabase/functions/_shared/templates.ts` — add `homework_graded` + `ai_satisfaction_prompt` to the `MessageTemplateType` union and `DEFAULT_TEMPLATES` (copy the Hebrew strings from `src/lib/whatsapp/templates.ts:69-72`)
- `supabase/functions/_shared/whatsapp.ts` — add the 3 missing `APPROVED_TEMPLATES` entries to match the Node side: `payment_request` (2 params), `homework_assignment` (3), `homework_graded` (3), names `lessio_<type>_he`
- Add sync-reminder comments in both files pointing at the Node counterparts
- **Tests:** Node-side guard in `whatsapp.test.ts` — every `APPROVED_TEMPLATES` name exists in `registerTemplates.ts`'s `TEMPLATES` list

### 0c: message-templates settings UI shows all 16 types
- `src/app/(dashboard)/settings/message-templates/page.tsx` — derive `ALL_TYPES` from `Object.keys(DEFAULT_TEMPLATES)` instead of the hardcoded 14-entry list (adds `homework_graded`, `ai_satisfaction_prompt`; prevents future drift). Labels/variables/previews already exist.

---

## Story 1 — Connection Lifecycle 🔴 (M)

### 1a: `wabaId` required in saveWhatsAppConnection
- `src/app/(dashboard)/settings/whatsapp/actions.ts` — `wabaId: z.string().min(1, '...')` (Hebrew error: "חיבור ל-Meta לא החזיר מזהה חשבון WhatsApp Business — נסי להתחבר מחדש"); remove the `if (wabaId)` branches so `subscribeAppToWABA` + `registerTemplatesForWABA` always run; store `whatsapp_waba_id` unconditionally
- `EmbeddedSignupButton.tsx:66-74` — treat missing `waba_id` like missing `phone_number_id`/`code`: don't submit, log warn
- **Tests:** new `src/app/(dashboard)/settings/whatsapp/actions.test.ts` (mock structure per `settings/ai-assistant/actions.test.ts`): missing wabaId → error, nothing persisted; happy path → subscribe + save + register; `subscribeAppToWABA` failure → error, nothing persisted

### 1b: Disconnect cleanup
- `src/lib/whatsapp/subscribeApp.ts` — add `unsubscribeAppFromWABA(wabaId, accessToken)`: `DELETE /v19.0/{wabaId}/subscribed_apps`, throw on non-OK (mirrors `subscribeAppToWABA`)
- `disconnectWhatsApp` — select `whatsapp_waba_id` + token first; if both present, decrypt and call unsubscribe **best-effort** (catch + log — a Meta failure must not strand the user; the token may already be revoked); then null out all three columns including `whatsapp_waba_id`
- **Tests:** extend `actions.test.ts` — all three columns cleared; unsubscribe called with decrypted token; unsubscribe failure still clears + returns success

### 1c: Embedded Signup `config_id`
- `src/lib/env.ts` — add `NEXT_PUBLIC_META_CONFIG_ID` to `REQUIRED_IN_PRODUCTION`; document in `.env.local.example` ("Meta App Dashboard → WhatsApp → Embedded Signup → Configurations")
- `settings/whatsapp/page.tsx` — read server-side, pass as `metaConfigId` prop (mirrors the `metaAppId` pattern); if empty, render the same red "not configured" message as missing `META_APP_ID`
- `EmbeddedSignupButton.tsx:94` — `config_id: metaConfigId` instead of `''`

---

## Story 2 — Automation Toggle Enforcement 🟠 (S)

Toggle → enforcement point mapping (`automation_new_leads_enabled` and `automation_cancellation_enabled` are already enforced in the webhook; homework has no toggle by design — matches the 5-toggle settings UI):

| Column | Enforced in |
|---|---|
| `automation_lesson_reminder_enabled` + `automation_lesson_reminder_hours` | `supabase/functions/lesson-reminders/index.ts` |
| `automation_dunning_enabled` (opt-in, default false) | `supabase/functions/payment-reminders/index.ts` |
| `automation_payment_request_enabled` | `src/lib/payment-request/autoSend.ts` |

- `lesson-reminders/index.ts` — add `.eq('automation_lesson_reminder_enabled', true)` to the org query; `reminderHours = automation_lesson_reminder_hours ?? lesson_reminder_hours ?? 24` (line 64 currently reads only the legacy column, so the settings dropdown has no effect today)
- `payment-reminders/index.ts` — `.eq('automation_dunning_enabled', true)` (⚠️ behavior change: existing orgs stop receiving dunning until they opt in — release notes)
- `src/lib/payment-request/autoSend.ts` — early-return when `automation_payment_request_enabled === false`, ANDed with the existing `auto_send_payment_request` master switch; **manual** sends from `/billing` stay ungated (a human clicked)
- **Tests:** `autoSend` toggle test (create `autoSend.test.ts` if absent); extend `webhook.test.ts` for the two webhook toggles (`new_leads` off → no `upsertLead`/no reply; `cancellation` off → keyword falls through to AI/fallback) — closes the Sprint 30 Story 3 test debt. Edge functions verified on staging (runbook §9).

---

## Story 3 — Portal OTP via AUTHENTICATION Template 🟠 (M)

Today `portal/[orgId]/login/actions.ts:83-86` sends a hardcoded string via `sendTextMessage` — fails (error 131047) outside the 24h window, which is exactly the cold-start login case for a parent who never messaged the org.

- `src/lib/whatsapp/registerTemplates.ts` — add `rawComponents?` escape hatch to `TemplateDefinition` (the 6 UTILITY templates keep `bodyText`/`example`); register `lessio_otp_he`, category `AUTHENTICATION`: `BODY { add_security_recommendation: true }`, `FOOTER { code_expiration_minutes: 10 }` (matches our OTP TTL), `BUTTONS [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'העתק קוד' }]`. Auth templates have a fixed Meta-generated body — no custom copy, no `example` needed.
- **New** `src/lib/whatsapp/sendOtp.ts` — dedicated sender using the existing `sendTemplateMessage`; the code goes in **both** the body parameter and the button parameter (`sub_type: "url"`, `index: "0"`). On template failure (not yet approved on that WABA — 132001/131047) fall back to the current Hebrew text so in-window logins keep working during rollout. Export template name/language constants.
- `src/app/portal/[orgId]/login/actions.ts:83-89` — replace with `sendOtp(...)`; keep the try/catch + Hebrew user error; the `redirect()` stays outside the try/catch (CLAUDE.md rule — already correct today, preserve it)
- ⚠️ Re-verify the auth-template Graph API shape against current Meta docs at implementation time.
- **Tests:** new `sendOtp.test.ts` — dual body+button components carry the code; template failure → text fallback with the code; both fail → throws

---

## Story 4 — Webhook Hardening 🟠 (M, one migration) — supersedes Sprint 30 Stories 4c/4d (WhatsApp parts)

### 4a: Rate limit — 30 msgs/phone/5min, never 429
- `src/lib/whatsapp/idempotency.ts` — new `isRateLimited(db, orgId, phone)`: `count: 'exact', head: true` on `whatsapp_processed_messages` where `phone` + `created_at > now−5min`; ≥30 → limited. **Fail open** on count error (availability over strictness for a paying org's parents).
- `route.ts` `processMessage` — check after org resolution, **before** `claimIncomingMessage` (dropped messages insert no row, so the window slides naturally); over limit → structured `console.warn` + return. The 200 was already returned before `after()` work runs, so Meta never sees a 429 by construction. Existing index `(organization_id, created_at DESC)` suffices.

### 4b: Unknown `phone_number_id` → error + Sentry + superadmin notification
- **Migration** `YYYYMMDDHHMMSS_superadmin_notifications.sql`: `ALTER TABLE in_app_notifications ALTER COLUMN organization_id DROP NOT NULL;` (RLS is deny-all/service-role — nullable org is safe)
- `src/lib/notifications/index.ts` — add `'webhook_unroutable'` to `NotificationType`; `notifySuperadmins(type, title, body?, actionUrl?)` inserting rows with `organization_id: null` for all active superadmin profiles; `getNotificationsForSuperadmin(profileId)` reading `organization_id IS NULL` rows
- `route.ts:195-198` (org-not-found) — structured `console.error` + `Sentry.captureException` (`@sentry/nextjs` is already wired via `next.config.ts`/`instrumentation.ts`) + fire-and-forget `notifySuperadmins`. **Throttle:** skip if an unread `webhook_unroutable` notification with the same `phone_number_id` exists from the last 24h (a disconnected org can emit hundreds of messages/day; Sentry self-dedupes by grouping)
- Minimal admin surface: unread-notifications list on the existing superadmin dashboard page (`src/app/(admin)/admin/`) + mark-as-read — no bell/badge infrastructure this sprint
- **Tests (extend `webhook.test.ts`; mock `@sentry/nextjs` + `@/lib/notifications`):** 31st message in 5min → dropped (no claim, no intent handling, still 200); count error → processed (fail open); unknown `phone_number_id` → Sentry + `notifySuperadmins` + 200

---

## Story 5 — Template Approval Status Tracking ✅ Done (shipped 2026-08-18, expanded)

Shipped beyond the original scope: rather than only *tracking* the status of Lessio's
hardcoded templates, an owner can now submit **their own edited copy** to Meta and the
send path uses it once approved. That closes the split where an org rewrote a reminder
in settings and parents still received Lessio's stock wording outside the 24h window.

- ✅ **Side-fix:** `MetaWebhookPayloadSchema` in `src/lib/whatsapp/parsePayload.ts` no longer demands the messages shape on every change — `value` is `unknown` in the envelope and validated per change, so a `message_template_status_update` riding along no longer fails the whole `safeParse` and drops real messages.
- ✅ `parseTemplateStatusUpdates(body)` — reads `entry[].id` (= WABA id) and `message_template_status_update` changes.
- ✅ **Migration** `20260818000001_whatsapp_template_statuses.sql`. PK `(organization_id, template_name, language)`, RLS deny-all/service-role. Carries the planned status columns **plus** `type` / `version` / `body_text` / `var_order` for org-authored submissions, with a CHECK that those four are all-set or all-null.
- ✅ `route.ts` POST — resolves the org by `whatsapp_waba_id` and upserts inside the existing `after()` block.
- ✅ Status chips + rejection reason live on `settings/message-templates` (next to the body being approved) rather than `settings/whatsapp`, which is where they are actionable.
- **New this story, beyond the original plan:**
  - `src/lib/whatsapp/submitTemplate.ts` — converts an org's `{{named}}` body to Meta's positional `{{1}}` form, validates against the rules Meta enforces (unknown variable, variable at start/end → 2388299, 1024-char cap), and rebuilds parameters at send time. Variable order comes from the org's own body, not a fixed per-type list, because the editable body and the built-in Meta template do not use the same variable sets.
  - `src/lib/whatsapp/templateStatus.ts` — status reads/writes plus `refreshTemplateStatusesFromMeta` (`GET /{WABA_ID}/message_templates`), exposed as a *Refresh statuses* button so approval is visible without waiting on the webhook.
  - Submissions ship as `lessio_<type>_<lang>_c<n>`, versioned for the same reason as `_v2`: editing an approved template resets it to PENDING at Meta, so the previously approved one stays live until the replacement clears.
  - `sendSmartMessage` (Node **and** the Deno mirror) prefers the org's approved template over the built-in one, exact language match only. Deno callers now pass `namedVars` alongside the positional list.
  - `TEMPLATE_LABELS` is now per-UI-locale — English reviewers previously saw Hebrew type names on every card.
- ⏳ **Still ops work:** subscribe the app to the `message_template_status_update` webhook field in the Meta console (runbook §2). Until then the Refresh button is the only status path.
- ✅ **Tests:** `submitTemplate.test.ts` (conversion + every rejection + all submittable defaults); `parseTemplateStatusUpdates` extraction; mixed messages+status payload still yields the message; `sendSmart` custom-template precedence; webhook status upsert + 200.

---

## Story 6 — Bot Improvements 🟡 (M)

### 6a: Intent collision fixes
- Check `hasBookingIntent` **before** `hasScheduleIntent` (today "אני רוצה לקבוע שיעורים" hits the bare-`שיעורים` schedule match); drop the over-generic `לינק` from `hasPortalIntent`; word-boundary `עשיתי` in `hasHomeworkDoneIntent`
- **Tests:** the collision examples above as regression cases in `whatsapp.test.ts`

### 6b: Non-greedy cancellation session
- In `handleCancellationSelection`: if the message isn't a valid number, check the other intent detectors first — a match deletes the session and routes to that intent (today a parent asking "כמה אני חייב" mid-flow gets "קלט לא תקין" + a resent list for 10 minutes). Add an explicit exit word ("יציאה")
- **Tests:** mid-session balance query routes to balance + session deleted; mid-session garbage still re-sends the list

### 6c: Group lessons — no bot cancellation
- `executeCancellation` / `handleCancellationSelection`: if the lesson has >1 `lesson_students` row → don't cancel; reply "שיעור קבוצתי — לביטול פני לצוות" + in-app notification to owners/admins (reuses the `notifyMultiple` path from `new_lead`)

### 6d: Non-text messages + delivery statuses
- `parsePayload.ts` currently drops anything that isn't `type === 'text'` silently, and discards Meta status callbacks. Reply politely to non-text messages ("אנחנו תומכים בהודעות טקסט בלבד") with a per-sender throttle; parse `statuses` and log `failed` deliveries to the outbound log (6e)

### 6e: Outbound message log
- **Migration** (can ride Story 4's or 5's PR): `whatsapp_outbound_messages (organization_id, phone, template_type, status, error, created_at)`, RLS deny-all — fire-and-forget insert from `sendTextMessage`/`sendTemplateMessage`. Today outbound sends are not logged at all and delivery failures are invisible.

### 6f: Small fixes
- Dedicated `receipt_reply` template type (today `handleReceiptQuery` stuffs receipt lines into `balance_reply`'s `charge_lines`)
- `handlePortalQuery` — guard the `NEXT_PUBLIC_APP_URL ?? ''` fallback (currently sends a relative, unusable link if unset)
- Cancellation alert also to the lesson's **teacher** (today only the org owner, and only if `profiles.phone` is set)

---

## Story 7 — Sender Role Awareness 🟠 (M, one migration) — ✅ DONE

The webhook resolved every inbound phone against `parents` alone. Everyone else was a lead, so a
teacher or the org owner writing to the business number got *"this number is not registered with
us yet"* plus a lead row in their own CRM — and a student replying to the homework reminder the bot
had just sent **to their own phone** (`homework-reminders`/`homework-sender` prefer `students.phone`)
was treated as a stranger. Decision #26's "resolve actor identity" was half-implemented.

### 7a: Identity layer
- `src/lib/whatsapp/sender.ts` — `resolveSender(orgId, phone)` → `parent | student | teacher | staff | unknown`, four lookups in parallel, all org-scoped. `alsoKnownAs` carries the other capacities a phone holds
- Precedence `parent > student > teacher > staff`. Parent first is load-bearing — it preserves the reply a teacher-who-is-also-a-parent already got
- Only `parents` is unique on `(organization_id, phone)`. `students.phone`/`profiles.phone` have **no** uniqueness, so those use `order('id').limit(1)` — `maybeSingle()` errors on multiple matches
- A failed lookup **throws** rather than reading as "not this role": a transient DB error must not downgrade a teacher to a sales lead

### 7b: Per-role flows
- `ROLE_MENUS` in `menu.ts` is the single source of truth; `isActionAllowedForRole` re-checks every tapped payload, since reply ids come from the client
- Student → own schedule + homework (list and "סיימתי"). Teacher → own schedule + students, **read-only**. Staff → today's summary, **read-only**
- Handlers in `src/app/api/whatsapp/webhook/handlers/{student,teacher,staff}.ts`; shared query/format cores in `../shared.ts` — the parent path now calls the same `buildUpcomingLessonLines` / `findOpenAssignments` / `markAssignmentDoneAndAlert`, so there is no duplicated schedule or homework logic
- The teacher's homework alert distinguishes student-marked from parent-marked (`sendHomeworkAlert(..., markedBy)`)

### 7c: `profiles.phone` was never written 🔴
- The column was read in three places (cancellation owner alert, homework teacher alert, `saas-renewal-reminder`) but **no code ever wrote it** — no UI, no invite field, no import. Those alerts were dead in practice, and teacher/staff recognition could never fire
- Added to the teacher invite + edit forms, normalized to E.164 via `normalizePhone` on write (decision #8), surfaced on the teacher detail panel

### 7d: Collision handling
- **Migration** `20260817000001_whatsapp_sender_roles.sql`: `whatsapp_sender_preference (organization_id, phone, role)` RLS deny-all, written only on an explicit "switch role" tap; plus `idx_students_org_phone` and `idx_profiles_org_phone` (the students lookup had no index at all and now runs on every inbound message)

### Tests
- `sender.test.ts` (22): each capacity, every collision pair, stored-preference override and its staleness guard, duplicate-phone rows, per-table DB errors
- `webhook.test.ts` (+16): student/teacher/owner recognised and **not** filed as leads; unknown number still is; role-scoped menu contents; a student's `m:balance` tap refused; switcher only when several capacities; the student homework-done flow end to end
- The 36 pre-existing webhook tests pass with no assertion changes — the parent path is unchanged

### Deliberately out of scope
- **Teacher/staff mutations** (attendance, cancellation) — no real confirmation step in WhatsApp; a mistyped reply would move a parent's charge
- **AI assistant for non-parents** — `buildSystemPrompt` builds parent context; per-role prompts need defined information boundaries (what may a teacher ask about another parent?)
- **Per-role approved templates** — role menus work inside the 24h window immediately, but fall back to plain text outside it until `lessio_menu_teacher_{he,en}` etc. are approved at Meta. Registration is an ops task with lead time; the parent template is unaffected

---

## Story 9 — Parent Messaging Consent (Opt-in) 🟠 (M, one migration) — ✅ DONE

Story 8 recorded consent being *withdrawn*. Nothing recorded it being *given*. Every parent row is
entered by the tutoring business — dashboard form, CSV import, lead conversion — and the first
thing a parent ever heard from the number was a lesson reminder or a payment request. The Terms
pushed the whole duty onto the customer (`TermsHe.tsx:135`) and separately claimed that *"entering
the parent portal"* constitutes acceptance — while the portal login showed no terms and linked to
nothing. Meta's messaging policy expects an opt-in story, and the App Review submission had only
the opt-out half of it.

### Closed decision: notice, not a block

A parent with no consent record still receives messages. Blocking would silently mute every legacy
and imported parent — worse for the tutor and worse for the parent than one explanatory message.
Instead the **first** business-initiated message to any parent is preceded by a one-time welcome
notice naming the business, listing what will be sent, and giving the stop word. Consent from the
other sources is *recorded as evidence*, and never changes send behaviour.

### 9a: Schema
- **Migration** `20260820000001_parent_consent.sql` — on `parents`: `consent_source`
  (`attested|import|portal|booking|whatsapp_reply`, CHECK-constrained), `consented_at`,
  `consented_by` (→ `profiles`, set only for staff-declared consent), `welcome_sent_at`
- `welcome_sent_at` is deliberately independent of `consented_at`: consent is the evidence, the
  notice is what the parent actually sees. `opted_out_at` is unchanged and always wins over both

### 9b: One gate for every business-initiated send
- `src/lib/whatsapp/consent.ts` — `prepareBusinessSend({orgId, phone, accessToken, phoneNumberId, locale})`
  → `{ok:true} | {ok:false, reason:'opted_out'}`. Opt-out check, then an **atomic** claim
  (`UPDATE … WHERE welcome_sent_at IS NULL RETURNING id`) so two crons racing on one parent cannot
  both send the notice. A send failure releases the claim, so the next message retries instead of
  skipping the notice forever
- Fail-open throughout, including against thrown exceptions — this gate fronts every reminder in
  the product, so a DB blip must not become a messaging blackout
- Deno mirror: `prepareBusinessSend` extracted in `supabase/functions/_shared/whatsapp.ts`, covering
  all four reminder crons
- **Three leaks closed** that Story 8 left open — business-initiated parent sends that used
  `sendTextMessage`/`sendTemplateWithQuickReplies` directly and never consulted `opted_out_at`:
  `payment-request/autoSend.ts` (automatic payment request after a completed lesson),
  `receipts/issueReceiptForCharge.ts` (receipt notice), `day-off/index.ts` (teacher time-off
  cancellation notice; an opted-out parent is now `skipped`, not counted as `failed`)
- Deliberately **not** gated: `sendOtp` (authentication, parent-initiated), booking confirmations,
  and every webhook reply — an opted-out parent who asks a question still gets an answer

### 9c: Welcome notice template
- New `welcome_notice` type in `MessageTemplateType` / `DEFAULT_TEMPLATES` (he+en), mirrored
  byte-identically into `supabase/functions/_shared/templates.ts`
- Meta templates `lessio_welcome_notice_{he,en}_v2` (UTILITY, `{{1}}` = business name, kept
  mid-sentence — Meta rejects a variable at the very start or end of a body)
- Always sent as a template: first contact is a cold start by definition

### 9d: Where consent is captured
| Source | Where | Recorded as |
|---|---|---|
| Business declaration | checkbox on the parent form, the student form's inline new-parent block, and lead conversion | `attested` (+ `consented_by`) |
| Import | optional `whatsapp_consent` / `parent_whatsapp_consent` column, **or** a single "all parents in this file agreed" checkbox on the import screen | `import` |
| Parent portal | terms + messaging line under the phone step; recorded on successful OTP verify — the parent proving the number is theirs | `portal` |
| Booking form | same line on the confirm step | `booking` |
| Inbound WhatsApp | the parent writes to the business number, which Meta treats as opt-in | `whatsapp_reply` (also marks the notice unnecessary) |

`recordParentConsent` never overwrites an existing record — the first evidence is the one that counts.

### 9e: Dashboard + legal
- "No consent on file" badge on `/parents` rows and in the detail sheet, plus a **Mark consent
  received** action (`attestParentConsentAction`, owner/admin, `requireMutation`)
- Portal login now actually shows the Terms and Privacy links it always claimed acceptance of
- Terms §7 and Privacy §4.5 (he+en) describe the welcome notice, the consent record and the opt-out

### Tests
- `consent.test.ts` (12): opt-out refusal, he/en notice, one-time claim, race loser, claim release
  on send failure, fail-open on DB error and on an outright throw, and each consent source
- `autoSend.test.ts` (+2) and `day-off/index.test.ts` (+1): regression pins for the closed leaks
- `sendSmart.test.ts`: gate is consulted before the session-window query, and the business message
  follows the notice rather than preceding it

### Deliberately out of scope
- **Double opt-in** (blocking until the parent taps "confirm") — considered and rejected above
- **Backfilling consent for existing parents**: `consented_at` stays NULL, which is honest. They
  get the welcome notice on the next business send, which is the point

---

## Ops / Meta Runbook (starts day one, runs in parallel)

1. **Meta Business App:** create a Business-type app in the Meta Developer Console; add the WhatsApp product → `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_APP_SECRET` (the App Secret serves both OAuth exchange and webhook HMAC)
2. **Webhook registration:** Callback URL `https://<prod>/api/whatsapp/webhook`, Verify Token = `WHATSAPP_VERIFY_TOKEN` (arbitrary string you invent); subscribe to fields `messages` + `message_template_status_update` (Story 5); move the app to **Live**
3. **Business Verification + App Review** 🔴 the long pole: verify the Lessio business (legal details must match `NEXT_PUBLIC_BUSINESS_*`); request Advanced Access for `whatsapp_business_management` + `whatsapp_business_messaging` (screencast of the Embedded Signup flow typically required). Until approval, only developer-account numbers work.
4. **Embedded Signup Configuration:** App Dashboard → WhatsApp → Embedded Signup → create a Configuration → `NEXT_PUBLIC_META_CONFIG_ID`; add the production domain to Allowed Domains (FB.login requires it)
5. **Existing orgs:** extend `scripts/backfill-waba-subscriptions.ts` to also call `registerTemplatesForWABA` (it already loads each org's decrypted token), then run it — fixes both `subscribed_apps` and missing templates (incl. the new `lessio_otp_he`)
6. **Migrations to staging/prod, in order:** `20260513120000_add_whatsapp_waba_id.sql`, `20260514000001_automation_toggles.sql`, then the new ones from Stories 4/5/6e, then `20260817000001_whatsapp_sender_roles.sql` (Story 7)
6b. **Backfill `profiles.phone`** (Story 7c): the column was never written, so every existing teacher/owner row is NULL and the bot cannot recognise them until it is filled in — either per teacher in the dashboard, or by a one-off script. Until then they fall through to the lead path exactly as before, so this is not a blocker for deploying Story 7.
7. **Crons:** register all 8 in the Supabase Dashboard (list per `docs/release-checklist.md`): `lesson-reminders` (hourly), `payment-reminders` (09:00), `homework-reminders` (08:00), `homework-sender` (hourly), `saas-subscription-checker` (00:00), `saas-renewal-reminder` (08:00), `data-retention` (03:00), `notification-cleanup` (04:00) — `config.toml` cannot express schedules (CLI v2.x)
8. **Prod env vars:** existing `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET` + new `NEXT_PUBLIC_META_CONFIG_ID`
9. **Smoke (staging, HTTPS — release-checklist scenario 7):** connect a test org end-to-end (verify `waba_id` persisted, templates registered, `getSubscribedApps` lists the app) → inbound message → bot reply → OTP login from a phone that never messaged the org (proves Story 3 cold-start) → lesson-reminder cron dry run → `data-retention` run and confirm old rows show `phone = '***'` (proves Story 0a)

---

## New env vars

```
NEXT_PUBLIC_META_CONFIG_ID=   # Meta Embedded Signup Configuration ID (Story 1c)
```

---

## Out of scope (Sprint 32 candidates)

- Single-participation cancellation for group lessons (bot cancels one student, lesson continues)
- Rescheduling flow via the bot (no `reschedule` intent exists today — by design so far)
- Interactive messages (buttons/lists) instead of numbered-text selection
- Arabic/English template variants (`lessio_*_ar`, `lessio_*_en`)
- Payment link inside the cancellation-charge confirmation (charge is created `pending` with no dispatch today)
- Meta tech-provider / multi-partner solution status
