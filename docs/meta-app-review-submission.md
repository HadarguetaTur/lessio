# Meta App Review — submission runbook

App: **lessio** (`937012339155188`) · WABA `1066332709132512` · test number `+1 555-198-7571` (`1338080832713619`)

Status as of 2026-08-17 (read from the Meta DevTools API, not the dashboard):

| Item | State |
|---|---|
| Business Verification | **passed** |
| Privacy policy | present |
| Data Use Checkup | complete for all requested permissions |
| Submission | `UNSUBMITTED` — never reviewed (`has_been_previously_reviewed: false`) |
| `can_submit` | `false` — *"previous submission is in review"*, while the history is empty |
| `whatsapp_business_messaging` | no Advanced Access |
| `whatsapp_business_management` | no Advanced Access |
| App Graph calls, last 30 days | 3 (quota 240) |

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
requested permission, within 30 days of submitting. The app sat at **0 calls** for a long time —
production traffic runs on connected orgs' system-user tokens, not this app's developer token, so
the counter never moves on its own. It is at **3** now, still short.

Filming generates most of what is needed: Video A steps 2–3 fire `POST /{WABA}/subscribed_apps`
and `POST /{WABA}/message_templates`, and Video B step 2 fires `POST /{PHONE_NUMBER_ID}/messages`.
Belt and braces, run this the same day:

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

## 2. Demo tenant — what the reviewer logs into

The submission form asks for test credentials. Handing over Hadar's own Hebrew org is the wrong
answer twice: reviewers do not read Hebrew, and it exposes real customer data. Instead
`scripts/seed-review-demo.ts` builds a self-contained English tenant, **Brightpath Tutoring**,
owned by a fictitious account.

```bash
# REVIEW_DEMO_PASSWORD is the password given to Meta — set it in .env.local first.
# It is deliberately not hardcoded in the repo.
npx tsx scripts/seed-review-demo.ts

# Point the Meta test number at the new org (releases it from the previous one).
DEMO_ORG_OWNER_EMAIL=reviewer@getlessio.com npx tsx scripts/connect-demo-whatsapp.ts
npx tsx scripts/diagnose-demo-whatsapp.ts
```

What it creates: 3 teachers with availability, 12 parents, 15 students, ~14 weeks of lessons,
four months of billing through the real engine (last month left open), homework with graded
submissions, lesson notes and learning goals. Everything sits under fixed UUIDs prefixed
`d2000000-`, distinct from the Hebrew demo's `d1000000-`, so the two clean up independently.
The script is idempotent — re-run it daily to roll the showcase lesson forward.

Two settings do the language work, and neither has a UI:

- `profiles.preferred_locale = 'en'` on the reviewer account. `src/app/login/actions.ts` reads it
  at sign-in and overwrites the `locale` cookie, so the dashboard opens in English and LTR.
- `organizations.default_locale = 'en'`, so the bot answers in English.

`organizations.onboarding_completed = true` matters just as much: without it the reviewer lands
in the setup wizard instead of the product.

### The unconnected twin, for filming the connect flow

`REVIEW_DEMO_VARIANT` builds a second, identical tenant that deliberately has **no** WhatsApp
number attached, which is what Video A's Embedded Signup shot needs — the connected tenant can
only ever show the already-connected state.

```bash
REVIEW_DEMO_VARIANT=2 npx tsx scripts/seed-review-demo.ts
```

It gets its own org id (`d2000002-…`), slug (`brightpath-tutoring-2`) and auth accounts
(`reviewer2@getlessio.com`, `sarah.klein2@demo.getlessio.com`, …) on the same
`REVIEW_DEMO_PASSWORD`, so the two live side by side and neither run disturbs the other. The
data is identical: 226 lessons, 15 students, four months of billing.

Never run `connect-demo-whatsapp.ts` against the variant. The Meta test number belongs to exactly
one org — the webhook resolves it by `phone_number_id` with `.single()` — so connecting it here
would silently break the bot on the tenant handed to Meta.

The variant also seeds every reminder automation **off**, unlike the base tenant. The reminder
crons sweep every org that has a number attached, so the moment a real business account is
connected on camera, an hourly `lesson-reminders` run would otherwise message the twelve
fictional parent numbers from it. Toggle them on in `/settings/whatsapp` if a shot needs them.

Clean it up with the same variable: `REVIEW_DEMO_VARIANT=2 npx tsx scripts/cleanup-review-demo.ts --yes`.

### Credentials block for the submission form

```
URL:      https://www.getlessio.com/login
Email:    reviewer@getlessio.com
Password: <REVIEW_DEMO_PASSWORD>

This account owns "Brightpath Tutoring", a demo tutoring business with 3 teachers,
15 students, a full lesson schedule and 4 months of billing. The interface is in English.

Testing WhatsApp: the connected number (+1 555-198-7571) is a Meta test number and can
only deliver to pre-verified recipients, so a reviewer cannot receive bot replies on
their own phone. The full round-trip is shown in the screencast. Tell us the number you
would like to test from and we will add it to the verified list within one business day.
```

That last paragraph is not optional. Without it, a reviewer who messages the test number, gets
nothing back, and concludes the integration is broken.

## 3. Screencasts — two of them, no audio

Three rules from Meta's documentation, each a stated rejection reason. Earlier versions of this
runbook contradicted all three:

1. **One video per permission.** *"Do not submit a video that includes multiple permissions
   supporting different use cases... Your submission may be rejected if you highlight multiple
   permissions being used as part of the same video."* No combined recording, however tempting.
2. **No narration.** *"Omit audio; our reviewers will not listen to it."* Everything worth saying
   is a burned-in caption. The English demo tenant means the UI carries most of it already.
3. **The `whatsapp_business_management` video must show a message template being created** —
   *"Record a video of your app, or WhatsApp Manager, being used to create a message template."*
   Embedded Signup belongs in each video as the authorization half (*"capture the complete
   authorization flow"*), but it is not the demonstration Meta looks for.

Technique for both: 1080p, browser window only, screen width ≤1440, enlarged mouse cursor, English
captions burned in, recorded against **production** (`www.getlessio.com`) — a reviewer who sees
`localhost` rejects it.

### Video A — `whatsapp_business_management` (~2:10)

1. **Sign-in (15s).** Start **logged out**. Log in as `reviewer2@getlessio.com` — the unconnected
   twin, so `/settings/whatsapp` still offers "Connect WhatsApp" — and land on the populated
   English dashboard. Caption: *"Tutoring business owner signs in to Lessio."*

2. **Embedded Signup (35s).** `/settings/whatsapp` → "Connect WhatsApp". Walk Meta's dialog end to
   end: business selection, WABA selection, phone number. **Hold 2–3 s on the permissions screen,
   zoomed.** Caption: *"The customer grants `whatsapp_business_management` for the WhatsApp
   Business Account they select — and only that account."*

   Caveat worth planning around: the Meta **test** number has no Embedded Signup path, which is
   why `connect-demo-whatsapp.ts` exists. Walk the dialog with a real business account to show the
   consent screen, then cut to the settings page showing the number connected.

3. **Template creation (20s) — this is the shot Meta actually requires.** On the connected settings
   page, click **"Register message templates on my WhatsApp account"** and show the result list
   appear. Caption: *"The tutor registers Lessio's message templates on their own WhatsApp Business
   Account. Lessio calls `POST /{WABA-ID}/message_templates`."*

4. **Proof on Meta's side (25s).** Cut to **WhatsApp Manager → Account tools → Message templates**
   for that WABA, sorted newest first: the same `lessio_*` names, matching timestamps,
   PENDING/APPROVED. Caption: *"The same templates, now on the customer's account. This is
   `whatsapp_business_management`."*

5. **One template up close (15s).** Open `lessio_lesson_reminder_en_v2` to show the body and its
   variables. Caption: *"A UTILITY template used to remind a parent about their child's lesson."*

**Do not send a single message in this video** — that is the trap rule 1 describes.

The step-3 button is `RegisterTemplatesButton` → `registerTemplates` in
`src/app/(dashboard)/settings/whatsapp/actions.ts`, which awaits `registerTemplatesForWABA` and
renders the per-template outcome. It exists because registration at signup is fire-and-forget:
without it there is no way to trigger template creation on camera at all with the test number, and
no way for a real customer to retry a failed registration.

It reports templates that already exist as registered rather than newly created. Delete two or
three `lessio_*_en_v2` templates in WhatsApp Manager before filming so the button visibly recreates
them and they carry a fresh timestamp in step 4. Deleted UTILITY templates re-approve in minutes.

### Video B — `whatsapp_business_messaging` (~2:20)

Open with the **same footage as Video A steps 1–2**, trimmed — it is the authorization flow Meta
wants in each video. One filming session, two edits. Then:

1. **Inbound (70s).** From Rachel Adams' phone, send `hi` to the business number. Show the English
   interactive menu, then complete one full flow — "Cancel a lesson" is the strongest — and cut
   back to the dashboard showing the lesson now `cancelled`. This proves the webhook round-trip,
   which reviewers specifically look for.

2. **Outbound (60s).** Dashboard → the showcase lesson scheduled for **tomorrow at 16:00**
   (`d2000000-0000-4000-8000-000000000003`) → lesson detail → **"Send WhatsApp reminder"**. Show
   the button turn to "Reminder sent ✓" **and, in the same frame**, the message landing in the
   WhatsApp client. **One continuous take, no cut** — a video showing only the sending screen is
   rejected. Caption: *"Every message goes to a parent who is already a customer of the tutor and
   gave that tutor their number. No marketing, no bulk sending."*

   Use **WhatsApp Web signed in as the demo parent** side by side with the dashboard rather than a
   phone camera. Meta accepts *"either web or mobile app"* as the receiving client, and it makes
   the continuous take trivial — no camera, no pan, no cut.

   Inbound is filmed **before** outbound on purpose. The manual reminder no longer depends on the
   24h window (`sendLessonReminderAction` goes through `sendSmartMessage`), but with the window
   already open the reviewer sees the org's own template copy rather than the fixed Meta-approved
   wording — the better demonstration of the product.

   The seed leaves `welcome_sent_at` NULL on the reviewer's own number, so this take shows the
   **welcome notice arriving first** — *"messages in this chat are sent on behalf of Brightpath
   Tutoring… reply stop to opt out"* — immediately followed by the reminder. Caption: *"The first
   message a parent ever receives explains who is writing and how to stop."* Press the button a
   second time to show only the reminder arrives: the notice is one-time.

3. **Opt-out (30s).** Reviewers weight this heavily. From the phone, send `stop`. Show the
   confirmation, cut to the parent's row in `/parents` now carrying the **Opted out** badge, then
   press "Send payment request" on that parent and show it refuse. Send `start` to restore, so the
   demo is repeatable.

4. **Business control (20s, optional).** `/settings/whatsapp` → the automation toggles. Shows that
   the business decides what gets sent.

### Before recording

```bash
npx tsx scripts/seed-review-demo.ts         # rolls tomorrow's lesson forward, clears opt-outs + welcome notice
npx tsx scripts/connect-demo-whatsapp.ts    # refresh the 24h token first
npx tsx scripts/diagnose-demo-whatsapp.ts   # must be all ✓
npx tsx scripts/check-stored-whatsapp-token.ts  # proves the stored token can SEND, not just read

# Only for Video A's sign-in + Embedded Signup shots, on the unconnected twin:
REVIEW_DEMO_VARIANT=2 npx tsx scripts/seed-review-demo.ts
```

Confirm `DEMO_RESCHEDULE_ENABLED=1` and `DEMO_PAYMENT_LINK_ENABLED=1` are still set in Vercel —
reviewers test the live flows themselves after watching.

For Video B step 2 specifically:

- Log in as **owner or admin**. The reminder button is role-gated, and it only renders while the
  lesson is still `scheduled`.
- Confirm the **English** approved templates are live on the WABA, since the send falls back to
  them outside the window — and a Hebrew fallback mid-English-video is worse than no shot:
  `GET https://graph.facebook.com/v26.0/1066332709132512/message_templates?fields=name,status,language`
  → `lessio_lesson_reminder_en_v2`, `lessio_menu_en_v3` and `lessio_payment_request_en_v2` must
  all be `APPROVED`. If any is missing, run `npx tsx scripts/archive/register-templates-v2.ts` and wait —
  approval can take hours.

Retakes are safe: the `notification_log` row is an upsert that records the send for cron dedup
but does not block a repeat, and the button's "sent" state resets on page refresh.

## 4. Use-case text

One description per permission, each pasted into its own field beside its own video. Both are
mandatory — *"If you include a screen recording that shows how your app uses a permission, but fail
to include a description of how it uses it, your submission will be rejected."* Each must match its
video literally; a mismatch between the written use case and what the video shows is the most
common rejection. Do not paste the same text into both fields.

### `whatsapp_business_management`

> Lessio is a management platform for private tutors and small tutoring centres (scheduling,
> billing, and parent communication). Our customers are tutoring businesses that sign up at
> getlessio.com and connect **their own** WhatsApp Business Account through Meta's Embedded Signup
> dialog inside Lessio (Settings → WhatsApp → Connect).
>
> We use `whatsapp_business_management` only on the WhatsApp Business Account the customer
> explicitly selects in that dialog, and only for two operations:
>
> 1. **Creating and reading message templates on the customer's WABA.** When the connection
>    completes, Lessio calls `POST /{WABA_ID}/message_templates` and creates the UTILITY templates
>    the product needs — lesson reminder, payment request, payment reminder, homework assignment /
>    reminder / graded, lesson cancelled by teacher, and the service menu — in both English and
>    Hebrew, plus one AUTHENTICATION template for the parent-portal one-time password. The customer
>    can re-run this at any time from Settings → WhatsApp. We call
>    `GET /{WABA_ID}/message_templates` to read their approval status, so the app knows which
>    templates may be used outside the 24-hour customer-service window.
> 2. **Subscribing our webhook to the customer's WABA** with `POST /{WABA_ID}/subscribed_apps`, so
>    that messages parents send to the tutor's number reach Lessio and can be answered.
>
> We do not read or manage any other business asset, we never access a WABA the customer has not
> selected in the dialog, and we do not use this permission for analytics or advertising. The
> customer can revoke access at any time with the Disconnect button on the same settings screen,
> which removes the webhook subscription.

### `whatsapp_business_messaging`

> Lessio sends and receives WhatsApp messages on behalf of the tutoring business that connected its
> own number, between that business and the parents of its own students — people who are already
> customers of the tutor and who gave the tutor their phone number when they enrolled. There is no
> marketing, no bulk sending, and no purchased or imported third-party lists.
>
> **Business-initiated messages** (`POST /{PHONE_NUMBER_ID}/messages`), each triggered by the
> tutor's own data in the app:
> * Lesson reminders — automatically N hours before a lesson, and manually from the lesson screen.
> * Payment requests and payment reminders for the monthly bill the tutor has approved.
> * Homework assigned, homework due reminders, and graded-homework notices.
> * A notice to affected parents when a teacher's time-off request is approved and their lessons
>   are cancelled.
> * A one-time password when a parent signs in to the parent portal.
>
> Outside the 24-hour customer-service window these are sent as Meta-approved templates; inside the
> window they are free-form messages in the parent's own language (English or Hebrew).
>
> **Customer-initiated messages**: a parent writes to the tutor's number, our webhook receives the
> message, and Lessio replies with a service menu. From there the parent can book a lesson, cancel
> a lesson, check their balance and pay, or ask for a human. Every request is executed against that
> specific tutor's own schedule and billing data.
>
> **Opt-in**: the first business-initiated message Lessio ever sends a parent is preceded by a
> one-time notice that names the tutoring business the messages come from, lists what will be sent
> — lesson reminders, homework and payment requests — and gives the stop word. It is sent once per
> parent and recorded, so no one receives a reminder from a number they cannot place. The tutor
> also records, per parent, how consent was obtained: declared by the business when the parent was
> added or imported, given by the parent when they sign in to the parent portal or confirm a
> booking, or implied by the parent messaging the business first.
>
> **Opt-out**: a parent replying "stop" is recorded immediately, and from that moment Lessio sends
> them no business-initiated message of any kind — reminders, payment requests and homework
> notices are all blocked. Replies to messages the parent themselves sends are still answered.
> Replying "start" restores delivery.
>
> Each tutoring business performs all of this from its own Lessio dashboard, and every message is
> sent from that business's own phone number using the credentials obtained through Embedded
> Signup.

The opt-in paragraph is a real product feature too: `prepareBusinessSend`
(`src/lib/whatsapp/consent.ts`, mirrored for the crons in `supabase/functions/_shared/whatsapp.ts`)
claims `parents.welcome_sent_at` atomically and sends `lessio_welcome_notice_{he,en}_v2` before the
message that triggered it. Consent evidence lives on `parents.consent_source` / `consented_at`, and
`/parents` shows a badge for anyone without it. Video B step 2 shows the notice arriving ahead of
the first reminder.

The opt-out paragraph is a real product feature rather than a claim: `stop` (or `הסר`) sets
`parents.opted_out_at`, which blocks every business-initiated send in both the Node path
(`src/lib/whatsapp/sendSmart.ts`, the payment-request actions) and the Deno cron path
(`supabase/functions/_shared/whatsapp.ts`). It is the strongest single paragraph in the submission,
and Video B step 3 demonstrates it.

## 5. Submit

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

```bash
npx tsx scripts/cleanup-review-demo.ts --yes   # deletes the Brightpath org + its 4 Auth users
REVIEW_DEMO_VARIANT=2 npx tsx scripts/cleanup-review-demo.ts --yes   # and the unconnected twin
```

Then, manually: disconnect the test number, remove `DEMO_RESCHEDULE_ENABLED` and
`DEMO_PAYMENT_LINK_ENABLED` from Vercel, delete `src/lib/whatsapp/demoReschedule.ts` and its
dispatch block in the webhook, and move the webhook callback from the apex domain to `www`.

There is no `d1000000-` cleanup left to do: the earlier Hebrew demo lived in the
`hadart20@gmail.com` organization, and that organization and account were deleted on 2026-08-17
when the demo moved to Brightpath. `scripts/seed-demo-data.ts` targeted that org, became obsolete
(it failed with "No auth user found") and has since been deleted — recoverable from git history.

The opt-out work is **not** demo scaffolding — it stays.
