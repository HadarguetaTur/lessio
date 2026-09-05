# Google OAuth verification — submission runbook

One submission, in **Google Cloud Console → APIs & Services → OAuth consent screen**, covering
every Google integration in the product. There is no Android app, no TWA and no PWA manifest in
this repo, so Google Play is not in scope — "Google approval" here means OAuth app verification
(plus brand verification, which the logo triggers).

## 0. What is actually being submitted

All three Google features share **one Google Cloud project and one OAuth client**
(`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `src/lib/env.ts:59-64`), so one verification covers
all of them.

| Feature | Scopes requested | Google's classification | Code |
|---|---|---|---|
| Sign in with Google | `openid`, `email`, `profile` (Supabase defaults) | non-sensitive | `src/components/auth/LoginSocialButtons.tsx`, `supabase/config.toml:320-326` |
| Connect Gmail (send as the business) | `https://www.googleapis.com/auth/gmail.send` + `email` | **sensitive** | `src/lib/gmail/index.ts:19` |
| Connect Google Calendar (conflict detection) | `https://www.googleapis.com/auth/calendar.readonly` + `email` | **sensitive** | `src/lib/google-calendar/index.ts:19` |

### `gmail.send` is sensitive, not restricted — no CASA, no cost

This is the single most expensive thing to get wrong, in both directions. Google's own
[restricted scope list](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
covers the Gmail scopes that **read or modify** mailbox content (`gmail.readonly`, `gmail.modify`,
`mail.google.com`, …). `gmail.send` is not one of them: it can only inject an outbound message and
grants no read access, so it sits in the
[sensitive scope track](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

Practical consequence: **no third-party security assessment (CASA Tier 2), no annual assessor fee,
no Letter of Validation.** Sensitive-scope verification is free and Google's stated turnaround is
3–5 business days (in practice, expect longer if they come back with questions).

`calendar.readonly` is likewise sensitive, not restricted.

If a future sprint adds a scope that reads mailbox content or writes calendar events, that
classification changes — see "Known gaps" at the bottom.

### Why this cannot be skipped

While the app is unverified, three things are true, and the third one is a live production bug
waiting to happen:

1. Every consent screen shows the "Google hasn't verified this app" interstitial. On the sensitive
   scopes there is an *Advanced → Go to Lessio (unsafe)* path, which is a terrible first impression
   for a paying customer connecting their business Gmail.
2. A hard cap of **100 users** across the sensitive scopes for the life of the project. Not 100
   concurrent — 100 ever.
3. While publishing status is **Testing**, Google issues refresh tokens that expire after **7
   days**. Lessio stores exactly one refresh token per org and per teacher
   (`organizations.gmail_refresh_token`, `organizations.google_calendar_refresh_token`,
   `teacher_profiles.google_calendar_refresh_token`) and never re-prompts on its own — so every
   connection silently breaks a week after it is made. Moving to **In production** is what fixes
   this, and moving to In production is what triggers the verification requirement.

---

## 1. Console prerequisites

Do all of this before opening the verification form. An incomplete consent screen is the most
common reason a submission bounces back on day one.

### 1.1 Domain ownership

Verify `getlessio.com` in [Google Search Console](https://search.google.com/search-console), signed
in with **the same Google account that owns the Cloud project**. Google will not accept an
authorized domain the submitting account cannot prove it owns. DNS TXT record is the least
fragile method — the site is on Vercel, so add it at the registrar.

### 1.2 OAuth consent screen (User type: External)

| Field | Value |
|---|---|
| App name | `Lessio` — must match the name shown in the demo video, character for character |
| User support email | `support@getlessio.com` |
| App logo | The Lessio logo, 120×120 PNG, no rounded corners baked in |
| Application home page | `https://www.getlessio.com` |
| Privacy policy link | `https://www.getlessio.com/privacy` |
| Terms of service link | `https://www.getlessio.com/terms` |
| Authorized domains | `getlessio.com` — **and nothing else**, see below |
| Developer contact email | `hadart20@gmail.com` |

**Upload the logo in this submission, not after.** A logo triggers a separate *brand verification*
review that runs alongside the scope review; doing it later means going through review a second
time.

**Do not add the Supabase domain to Authorized domains.** The console nudges you towards it,
because the login redirect URI lives on `iesxiouhgdxmymveikxh.supabase.co` and the page says any
domain used in an OAuth client's configuration must be pre-registered. Adding it breaks the
submission two ways: Google only accepts a *top private domain* there (`supabase.co`, never a
subdomain of it), and at verification it requires proof of ownership in Search Console for every
domain on the list — `supabase.co` belongs to Supabase, so that proof can never be produced.

`getlessio.com` alone is correct. The Supabase callback stays where it belongs, in **Clients** →
Authorized redirect URIs, and Google sign-in keeps working unchanged. If a reviewer ever asks about
the redirect domain, the answer is that the app authenticates through a third-party provider
(Supabase) whose domain it does not own — a normal arrangement Google approves routinely.

If the domain is already listed and the console refuses to delete it (*"This domain is used by
these client URIs … Client credentials must be updated before deleting"* — encountered 04.09.2026,
the client named was the live `477270334034-m3os…`): first try clearing the field's text and then
hitting the trash icon. If it still refuses, do the round trip: Clients → the live client →
screenshot its redirect-URI list → remove the Supabase URI → save → Branding → delete the domain →
save → Clients → re-add `https://iesxiouhgdxmymveikxh.supabase.co/auth/v1/callback` → save. The
console accepts a redirect URI on an unauthorized domain (that's the normal Supabase end state);
Google sign-in is down only for the minute the URI is absent.

### 1.3 Scopes

Declare exactly what the code requests, and nothing else — least privilege is graded:

```
openid
.../auth/userinfo.email
.../auth/userinfo.profile
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.readonly
```

If the scope list in the console carries anything the code does not use, delete it before
submitting. Every extra scope needs its own justification and its own on-camera demonstration.

### 1.4 Authorized redirect URIs on the OAuth client

Base URL is `https://www.getlessio.com` — the apex 307-redirects to www, and `PRODUCTION_APP_URL`
in `src/lib/url/appUrl.ts:28` is the www form, so www is what the code sends as `redirect_uri`:

```
https://www.getlessio.com/settings/email/callback          ← Gmail   (src/lib/gmail/index.ts:22)
https://www.getlessio.com/api/google-calendar/callback      ← Calendar (src/lib/google-calendar/index.ts:22)
https://iesxiouhgdxmymveikxh.supabase.co/auth/v1/callback   ← login (Supabase handles this leg)
http://localhost:3000/settings/email/callback               ← dev only, optional
http://localhost:3000/api/google-calendar/callback          ← dev only, optional
```

A missing URI here surfaces as `redirect_uri_mismatch` at the top of the consent flow, which will
also ruin a take.

### 1.5 Enabled APIs

`Gmail API` and `Google Calendar API` must both be enabled on the project. The consent screen can
list a scope for an API that is not enabled; the call then fails at runtime, which is exactly the
failure a reviewer would film.

### 1.6 Publishing status

Set to **In production**. This is what opens the "Prepare for verification" flow. Existing
connections keep working while the review runs.

**Known cosmetic issue, not a blocker:** the *Sign in with Google* consent screen is served by
Supabase, so it reads *"to continue to iesxiouhgdxmymveikxh.supabase.co"* rather than
`getlessio.com`. It does not block verification (the Gmail and Calendar flows, which are the ones
under review, redirect to `www.getlessio.com` directly). Fixing it means configuring a custom
domain for Supabase Auth — worth doing for polish, not worth delaying this submission for.

---

## 2. Before filming — run the flows once, for real

`docs/ux-audit-5-settings-integrations.md:89-90` records both Google surfaces as PARTIALLY tested:
*"OAuth של Google לא בוצע"* on `/settings/email` and `/settings/calendar`. **Neither OAuth flow has
ever been executed end to end against production.** Do that first, on a throwaway Google account,
and fix whatever breaks — discovering a `redirect_uri_mismatch` or a token-encryption failure
mid-recording costs an afternoon.

Checklist for that dry run:

- [ ] `/settings/email` → Connect Gmail → consent → back to Lessio with `?connected=1`
- [ ] The connected address renders, and **Send test email** actually delivers
- [ ] `/settings/calendar` → Connect → consent → `?connected=1`, address renders
- [ ] Create a lesson that overlaps a real event on that calendar → the conflict warning appears
- [ ] Disconnect on both pages clears the stored token

Two fixtures to sort out before the camera rolls:

- **`SendTestEmailForm` has a hardcoded personal address as its default value**
  (`defaultValue="yeshuat11@gmail.com"`, `src/app/(dashboard)/settings/email/SendTestEmailForm.tsx:23`).
  A reviewer sees a stranger's personal Gmail address prefilled in a business product. Clear it or
  replace it with the demo parent's address before filming — ideally before launch, full stop.
- Google's grants persist. To re-film a first-time consent screen, revoke Lessio at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions) first. (Both
  `buildGmailAuthUrl` and `buildCalendarAuthUrl` pass `prompt: 'consent'`, so the screen does
  reappear — but revoking is the only way to show the genuine first-grant state.)

---

## 3. Demo video

One video is enough here — unlike Meta, Google does not require one video per scope, and a single
recording showing each scope in turn is standard. Upload to YouTube as **Unlisted** and paste the
link into the verification form.

Record against **production** (`www.getlessio.com`), signed in as the English demo tenant
`reviewer@getlessio.com` / Brightpath Tutoring (`scripts/seed-review-demo.ts`) — the same tenant
built for the Meta review. Reviewers do not read Hebrew, and this keeps real customer data out of
the frame.

```bash
npx tsx scripts/seed-review-demo.ts   # idempotent; rolls the showcase lesson forward
```

Rules that matter: the browser address bar must be visible throughout (Google checks that the
consent screen and the app share the domain that was verified), the app name on the consent screen
must match the console exactly, and narration is fine — unlike Meta, Google does not object to
audio.

### Shot list

1. **Home page and identity (15s).** `https://www.getlessio.com` in the address bar. Say what
   Lessio is: management software for private tutors and small tutoring centres.

2. **Sign in with Google (20s).** `/login` → *Continue with Google* → the Google account chooser →
   land on the dashboard. Establishes the non-sensitive scopes.

3. **`gmail.send` — grant (30s).** `/settings/email` → *Connect Gmail*. **Hold 3 seconds on the
   consent screen**, large enough to read, so the reviewer can see the single "Send email on your
   behalf" permission and the Lessio name and logo. Return to the settings page showing the
   connected address.

4. **`gmail.send` — use (40s).** In one continuous take: press **Send test email**, then cut to the
   receiving inbox showing the message arrived **from the business's own Gmail address**. Then show
   the real production use — `/charges` → send a receipt to a parent, or `/homework/[id]` → grade
   an assignment, which emails the parent. Say the sentence out loud: *Lessio only sends; it never
   reads, lists or stores anything from the mailbox.*

5. **`calendar.readonly` — grant (25s).** `/settings/calendar` → *Connect*. Hold on the consent
   screen showing the read-only calendar permission. Return to the connected state.

6. **`calendar.readonly` — use (40s).** Show the connected Google Calendar with an event at, say,
   Tuesday 16:00. Go to `/lessons/new`, schedule a lesson into that exact slot, submit — the app
   returns the conflict warning (`assertNoCalendarConflicts`,
   `src/app/(dashboard)/lessons/new/actions.ts:392`). Say: *Lessio reads free/busy only; it never
   creates, edits or deletes events, and it never reads event titles or attendees.* That claim is
   literally true of the code — the only Calendar endpoint called anywhere is
   `POST /calendar/v3/freeBusy` with `items: [{ id: 'primary' }]`.

7. **Revocation (20s).** Press Disconnect on both settings pages; show the connection gone. Mention
   that access can also be revoked at `myaccount.google.com/permissions`. Reviewers weight this.

---

## 4. Scope justifications

One per sensitive scope, pasted into its own field on the verification form. Each must match what
the video shows; a mismatch between the written justification and the recording is the most common
cause of a second review round.

### `https://www.googleapis.com/auth/gmail.send`

> Lessio is management software for private tutors and small tutoring centres — scheduling,
> billing, homework and parent communication. Our users are the tutoring businesses themselves.
>
> A business owner may optionally connect their own Gmail account under Settings → Email, so that
> the emails Lessio sends to the parents of their students come from the business's own address
> rather than from a generic platform address. Parents recognise the sender, and replies reach the
> tutor directly.
>
> We use `gmail.send` for exactly one operation — `users.messages.send` — and only for messages the
> business owner's own action in the app produces:
>
> * receipts and payment confirmations for a charge the owner approved;
> * graded-homework notices to the parent of the student concerned;
> * a monthly progress report for a student, sent from the student's page;
> * a test email the owner sends to themselves to confirm the connection works.
>
> Every recipient is a parent already enrolled with that tutoring business. There is no marketing,
> no bulk sending, and no imported or purchased lists.
>
> We do not read, list, search, label, modify or delete anything in the mailbox, and we do not
> request any scope that would allow it. We request the `email` scope alongside it purely to record
> which address the messages are sent from, so the owner can see it on the settings page.
>
> The refresh token is stored encrypted with AES-256-GCM under a dedicated key and is used only to
> send the messages listed above. Pressing Disconnect on the same settings page deletes it.

### `https://www.googleapis.com/auth/calendar.readonly`

> Lessio schedules lessons for tutoring businesses. Tutors keep their personal commitments in
> Google Calendar, not in Lessio, so a lesson booked into an hour they are already busy is the
> single most common scheduling mistake the product exists to prevent.
>
> A business owner, or an individual teacher, may optionally connect their own Google Calendar and
> choose which of their calendars are consulted (the primary calendar by default). When a lesson is
> being created, Lessio calls the Calendar API's free/busy endpoint
> (`POST https://www.googleapis.com/calendar/v3/freeBusy`) for the selected calendars over the
> proposed lesson's time range, and warns if the slot overlaps a busy period. The user can then
> pick another time or confirm anyway. The calendar list itself is read once, only to render that
> choice on the settings page.
>
> That endpoint is the only Calendar API call in the entire product. It returns busy intervals — a
> start time and an end time — and nothing else: no event titles, no descriptions, no attendees, no
> locations. Nothing from Google Calendar is stored in our database; the busy intervals are used to
> render one warning and are then discarded.
>
> We do not create, modify or delete calendar events, and we request read-only access precisely so
> that we cannot. If a future version writes lessons back into the calendar we will request the
> appropriate scope and submit it for review separately.
>
> The refresh token is stored encrypted with AES-256-GCM under a dedicated key. Disconnecting from
> the settings page deletes it.

### Limited Use affirmation

Already published and reviewer-ready — `/privacy` §7.2 ("Google user data (Gmail and Google
Calendar connections)", `src/app/privacy/PrivacyEn.tsx:258-306`) discloses each scope separately,
states the encryption at rest, links the revocation path, and carries the verbatim Limited Use
affirmation linking to the Google API Services User Data Policy. Point the reviewer at that anchor
in the form.

**Resolved 04.09.2026:** the policy previously said Google-connected data *"may be synced to
Google Calendar"* and gave *"a calendar event"* as a transfer example — both describing writes the
`calendar.readonly` scope cannot perform. Both passages were reworded to read-only in
`PrivacyEn.tsx` and `PrivacyHe.tsx` and are live in production.

---

## 5. Submit and wait

Console → **OAuth consent screen** → *Prepare for verification*, which walks the same fields as
above and then asks for the video link and the per-scope justifications.

- Official turnaround for sensitive scopes: **3–5 business days**. Brand (logo) verification runs
  in parallel and is usually faster. A round of questions is normal and resets the clock.
- Google corresponds from **`api-oauth-dev@google.com`**, to the *user support email* and the
  *developer contact email* configured on the consent screen. Check both, including spam. A reply
  request left unanswered for long enough closes the submission.
- The app keeps working normally throughout: existing tokens stay valid, new users see the
  unverified interstitial until approval lands.

---

## 6. After approval

- Re-run the two connect flows on production to confirm the interstitial is gone.
- Verify a refresh token now survives past 7 days — that is the real proof that In-production
  status took effect. Connect an account, then check it still sends 10 days later.
- Clean up the demo tenant only when Meta is finished with it too
  (`npx tsx scripts/cleanup-review-demo.ts --yes`) — the same Brightpath org serves both reviews.

## Known gaps

- **`.env.local.example` lists none of the `GOOGLE_*` variables**, while `src/lib/env.ts:59-64`
  requires all four in production (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GMAIL_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_ENCRYPTION_KEY`). A fresh clone fails env
  validation with no hint as to which variables are missing.
- **Writing lessons back to Google Calendar** (decision #27, phase 2) needs
  `calendar.events` — still sensitive rather than restricted, but a different scope, so it means a
  fresh justification, a fresh video and another review round. Plan it as one submission, not two.
- **Supabase Auth custom domain** would put `getlessio.com` on the sign-in consent screen instead
  of the project ref. Cosmetic; does not block this submission.
