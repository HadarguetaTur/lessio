# Meta App Review — submission runbook

App: **lessio** (`937012339155188`) · WABA `1066332709132512` · test number `+1 555-198-7571` (`1338080832713619`)

Status as of 2026-08-16 (read from the Meta DevTools API, not the dashboard):

| Item | State |
|---|---|
| Business Verification | **passed** |
| Privacy policy | present |
| Data Use Checkup | complete for all requested permissions |
| Submission | `UNSUBMITTED` — never reviewed (`has_been_previously_reviewed: false`) |
| `whatsapp_business_messaging` | no Advanced Access |
| `whatsapp_business_management` | no Advanced Access |

Two steps are incomplete on **each** permission: `screencast` and `api_precheck`.
Everything else is done.

## 0. Drop `business_management` first

The app currently also requests `business_management`. **Remove it before submitting** —
it is the cheapest win available here, cutting a third of the review surface.

No production code path uses it. Every Graph call Lessio makes is
`/{waba}/message_templates`, `/{waba}/subscribed_apps`, `/{phone_number_id}/messages`, or the
token exchange — all covered by the two WhatsApp permissions. Meta's own Embedded Signup docs
say a Cloud API flow needs only those two; `business_management` exists for Solution Partners
sharing a credit line, which Lessio does not do.

Two places to remove it, both dashboard-only:

1. **App Review** → click the permission's trash-can icon to drop it from the submission.
2. **Facebook Login for Business → Configurations** (or WhatsApp → Embedded Signup) → edit the
   configuration and untick `business_management`. Do not create a new configuration — the
   Configuration ID is hardcoded as `NEXT_PUBLIC_META_CONFIG_ID`. Leaving it here means
   customers keep seeing a permission request Lessio never uses, which costs conversion on the
   signup dialog.

---

## 1. API pre-check

Meta will not mark `api_precheck` complete until it sees successful Graph calls made with each
requested permission. The app had **0 calls in the last 30 days** — production traffic runs on
connected orgs' system-user tokens, not this app's developer token, so the counter never moves
on its own.

Run this to generate the traffic:

```bash
# 1. App Dashboard → WhatsApp → API Setup → copy the temporary access token (24h TTL)
# 2. Put it in .env.local as WHATSAPP_DEMO_ACCESS_TOKEN=...
npx tsx scripts/meta-precheck-calls.ts
```

It makes real calls covering both permissions and prints per-permission coverage:

- `whatsapp_business_management` — read message templates, phone numbers, subscribed apps,
  WABA settings
- `whatsapp_business_messaging` — read the phone number, then send one approved-template
  message to the verified demo recipient (+972504343547)

Use `--no-send` to skip the outbound message while iterating.

The token expires daily. A 401 means only that — refresh it in API Setup and re-run.
Meta updates the pre-check with a lag; re-check status a few hours later.

## 2. Screencast

One recording can cover both permissions. Record in **Hebrew or English with English
subtitles**, 3–5 minutes, screen + narration, 1080p. Reviewers are not customers: state which
permission each step exercises, out loud and on screen.

Record against **production** (`www.getlessio.com`), not localhost — a reviewer who sees
`localhost` will reject it.

### Shot list

1. **Framing (20s).** Landing page. Say what Lessio is: a management system for private tutors
   and study centres in Israel — scheduling, billing, and parent communication over WhatsApp.
   Name the two permissions you are requesting and why.

2. **Embedded Signup — `whatsapp_business_management` (90s).**
   Log in as an org owner → `/settings/whatsapp` → "Connect WhatsApp". Walk through Meta's
   Embedded Signup dialog end to end: business selection, WABA selection, phone number.
   Land back on the settings page showing the number connected.
   Say on camera: *"Lessio uses `whatsapp_business_management` to register message templates on
   the customer's own WhatsApp Business Account and to subscribe our webhook to it. Lessio
   accesses only the WhatsApp Business Account the customer selects in this dialog — it does
   not read or manage any other business asset."*

3. **Templates — `whatsapp_business_management` (30s).**
   Show the templates Lessio registered on the WABA (WhatsApp Manager → Message Templates,
   or the in-app view). Point out they are UTILITY-category and customer-specific.

4. **Inbound — `whatsapp_business_messaging` (60s).**
   On the phone, send `היי` to the business number. Show the bot menu reply, then complete one
   full flow — cancelling a lesson is the strongest one — and cut back to the dashboard showing
   the lesson now marked cancelled. This proves the webhook round-trip, which reviewers
   specifically look for.

5. **Outbound — `whatsapp_business_messaging` (60s).**
   Dashboard → the seeded demo lesson scheduled for **tomorrow**
   (`d1000000-0000-4000-8000-000000000003`, from `scripts/seed-demo-data.ts`) → lesson detail →
   **"שליחת תזכורת בוואטסאפ"**. Show the button turn to "התזכורת נשלחה ✓", then pan or cut to
   the phone showing the message land. **Keep both halves in one continuous take** — a video
   showing only the sending screen is rejected.
   Say: *"Every message is sent to a parent who is an existing customer of the tutor and who
   provided their number to that tutor. Lessio does not send marketing or bulk messages."*

   Inbound is filmed **before** outbound on purpose. The manual reminder no longer depends on
   the 24h window (`sendLessonReminderAction` goes through `sendSmartMessage`), but with the
   window already open the reviewer sees the org's own Hebrew template copy rather than the
   fixed Meta-approved wording — the better demonstration of the product.

6. **Opt-out (20s).** Show a parent replying to stop messages and the system honouring it.
   Reviewers weight this heavily; do not skip it.

### Before recording

```bash
npx tsx scripts/connect-demo-whatsapp.ts   # refresh the 24h token first
npx tsx scripts/diagnose-demo-whatsapp.ts  # must be all ✓
```

Confirm `DEMO_RESCHEDULE_ENABLED=1` and `DEMO_PAYMENT_LINK_ENABLED=1` are still set in Vercel —
reviewers test the live flows themselves after watching.

For shot 5 specifically:

- Log in as **owner or admin**. The reminder button is role-gated, and it only renders while the
  lesson is still `scheduled`.
- Confirm the demo lesson is still in the future — re-run `npx tsx scripts/seed-demo-data.ts` if
  the date has rolled past.
- Confirm the approved fallback template is live on the WABA, since the send now depends on it
  outside the window:
  `GET https://graph.facebook.com/v19.0/1066332709132512/message_templates?fields=name,status,language`
  → `lessio_lesson_reminder_he_v2` must be `APPROVED`.

Retakes are safe: the `notification_log` row is an upsert that records the send for cron dedup
but does not block a repeat, and the button's "sent" state resets on page refresh.

## 3. Use-case text

Already marked complete, but re-read it before submitting. It must match the screencast
literally — the most common rejection is a mismatch between the written use case and what the
video shows. Keep it concrete: who sends, who receives, what consent exists, no marketing.

## 4. Submit

The API currently reports:

> `can_submit: false — Cannot submit to App Review while a previous submission is in review.`

This contradicts an empty submission history, so it is almost certainly a **stuck draft**, not a
real in-flight review. Open App Review in the dashboard and discard/reset the existing draft
before building the submission. If it persists after the draft is cleared, raise it with Meta
Direct Support — do not keep retrying.

Expect 5–15 business days for a verdict.

---

## Known risk: webhook is registered on the apex domain

The app's `whatsapp_business_account` subscription points at `https://getlessio.com/...`.
The apex domain answers **307 → www**. It works today (307 preserves method and body, and
inbound messages are arriving), but it is one redirect away from breaking, and
`scripts/diagnose-demo-whatsapp.ts` explicitly treats a redirect as fatal.

Not changed here: the demo is verified working end to end and swapping the callback URL
mid-review is the wrong time to find out otherwise. Change it to the `www` URL **after**
approval, then re-run the diagnostic.

## After approval

Per the cleanup plan: delete the demo rows (all UUIDs prefixed `d1000000-`), revert the demo
org's subscription, disconnect the test number, remove the `DEMO_*` flags from Vercel, and
upgrade Graph API `v19.0` → `v23.0` (hardcoded in 7 places).
