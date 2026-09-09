# Outbound engine — Gmail setup

How cold emails leave Lessio and how replies come back. There is no automation
layer in between: the engine (`src/lib/outbound/`) sends through the Gmail API
as each outreach mailbox, and reads each mailbox's inbox for replies, using a
Google **service account with domain-wide delegation** over the Workspace.

Operator screen: `/admin/outbound`. Leads the engine creates: `/admin/leads`.

## Why a service account, not the "Connect Gmail" OAuth flow

The per-org flow in `src/lib/gmail/index.ts` is for customers connecting their
own Gmail. It would be the wrong tool here:

| | OAuth (customer flow) | Service account + delegation |
|---|---|---|
| Who authorises | Each mailbox owner, on a consent screen | The Workspace admin, once |
| Google verification | Required (sensitive scope); `gmail.readonly` is *restricted* → CASA audit | Not required — internal to the domain |
| Token lifetime | Refresh token; 7-day expiry while the app is in Testing | None to expire; a signed JWT per call |
| Reading replies | Needs `gmail.readonly` on the public app | Granted by the admin, no review |
| Several mailboxes | One grant each | Any user on the domain |

The delegation scopes are not part of the public OAuth app and do not affect
its verification (`docs/google-oauth-verification-submission.md`).

## 1. Google Cloud — create the service account

1. Open the GCP project that holds the Lessio OAuth client.
2. **APIs & Services → Library → Gmail API → Enable** (if not already).
3. **IAM & Admin → Service accounts → Create**. Name it `lessio-outbound`. No
   project roles needed.
4. On the account: **Keys → Add key → JSON**. Download it once; it is the only
   copy. Note the **Unique ID** (a 21-digit number, also `client_id` in the
   JSON) — the Admin console needs it in the next step.

## 2. Workspace Admin console — delegate

**Security → Access and data control → API controls → Manage Domain Wide
Delegation → Add new**:

- Client ID: the service account's unique id
- OAuth scopes (comma-separated, exactly these two):

```
https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.readonly
```

`src/lib/gmail/serviceAccount.ts` requests exactly this pair; a mismatch fails
every call with `unauthorized_client`.

## 3. The mailboxes

Every address the engine sends from must be a real **active** Workspace user.
A user shown as *Automatically suspended* in **Directory → Users** cannot be
impersonated — reactivate it (open the user → *Reactivate*) before adding it
to the pool. Give each a display name Google will show as the sender.

Deliverability, not Lessio, sets the pace: a fresh mailbox should send a
handful a day for the first weeks. The default cap is 30/day per mailbox;
raise it per mailbox on `/admin/outbound` as the address warms up.

## 4. Environment

From the JSON key:

| Env var | Value |
|---|---|
| `GOOGLE_SA_CLIENT_EMAIL` | `client_email` |
| `GOOGLE_SA_PRIVATE_KEY` | `private_key`, newlines as literal `\n` (paste the JSON value as-is) |
| `LESSIO_OUTBOUND_CRON_SECRET_SHA256` | hex SHA-256 of the bearer token pg_cron sends (same token as the other cron routes) |

```bash
printf '%s' '<token>' | sha256sum | cut -d' ' -f1
```

Set all three in Vercel and in `.env.local`. The first two are optional at
build time (`/admin/outbound` shows a banner while they are missing); the
digest is required in production like the other cron secrets.

## 5. Crons

`scripts/setup-crons.sql` registers two pg_cron jobs against the app URL:

| Job | Schedule (UTC) | Route | Does |
|---|---|---|---|
| `outbound-send` | `*/10 5-15 * * 0-4` | `POST /api/internal/outbound/run-send` | Claims up to 5 prospects, sends each from the mailbox with the most room today, pauses 20–60 s between them |
| `outbound-replies` | `*/5 * * * *` | `POST /api/internal/outbound/run-replies` | Reads each active mailbox's inbox since its last poll and feeds new messages to `ingestReply` |

The send route re-checks the window itself (Sun–Thu, 08:00–18:00
Asia/Jerusalem, `src/lib/outbound/mailboxes.ts`), so a UTC/DST drift never
sends at night. Both routes are in the `proxy.ts` bypass list.

Manual runs, for testing:

```bash
# send now, ignoring the window and the pauses, at most 1
curl -X POST "$APP_URL/api/internal/outbound/run-send?immediate=1&batch=1" -H "Authorization: Bearer $TOKEN"
# poll replies now
curl -X POST "$APP_URL/api/internal/outbound/run-replies" -H "Authorization: Bearer $TOKEN"
```

## 6. First-run checklist

1. Migration `20260907140000_outbound_mailboxes.sql` applied.
2. Env vars set; `/admin/outbound` shows no banner.
3. Add one mailbox in the **Sending mailboxes** card; press **Send test email**
   to your own address. This is the delegation proof: a failure here is a
   scope or suspended-user problem, never a queue problem. The error text is
   shown next to the button and stored as the mailbox's *last error*.
4. Create a campaign, import a one-row CSV with your own address, run
   `run-send?immediate=1&batch=1`. The prospect turns `sent`; the message row
   carries the Gmail id, thread id and the `Message-ID` Lessio set.
5. Reply "כן" from that inbox, run `run-replies`. The prospect turns
   `interested`, a lead appears on `/admin/leads`, the demo email goes out via
   Resend.
6. Only then: real prospects.

## 7. What the engine stores

`outbound_mailboxes` is the pool (email, cap, last poll, last error).
`outbound_messages.transport` is `gmail` for everything the mailboxes send or
receive and `resend` for the platform demo email; `mailbox_id` says which box.
A reply is matched by from-address first, then by Gmail thread id, then by the
`In-Reply-To` header against the `Message-ID` Lessio generated on send.

## 8. Opening lines drafted by the AI

Give the CSV a `website` column (a URL, a profile link, or just a sentence you
typed) and tick **"let the AI draft an opening line"** on import. Those rows land
as `pending` and the `outbound-openers` cron reads the page and asks the platform
model for one sentence in the prospect's language.

**A drafted line cannot be sent.** The send claim only ever picks up a prospect
whose opener is `none` (the CSV already had a `personal_line`, or there is no
source) or `approved`. Everything else waits in **"opening lines to review"** on
`/admin/outbound`, where you edit, approve, redraft, or skip (skip sends the
campaign body with no opener).

An optional `gender` column (`f`/`m`, `נ`/`ז`) tells the Hebrew copy how to
address the person. Without it, the wording avoids the choice rather than
guessing. `OPENAI_API_KEY` is optional; without it a row simply fails to
`NO_API_KEY` and you write the line yourself.

## 9. Follow-ups

Only for people who already answered. Nobody who ignored the first email is
mailed twice.

| After | Then | And |
|---|---|---|
| the demo email went out | +3 days: "did you get to watch?" | +4 more days: a last note with the trial link |
| a reply nobody could read as yes or no | +2 days: one clarification | nothing further |

Each touch goes out from the mailbox that sent the cold email, inside the same
Gmail conversation (`threadId` + `In-Reply-To` + a `Re:` subject), and counts
against that mailbox's daily cap. Any real reply cancels what is queued; an
out-of-office does not. If the mailbox is full or switched off, the touch waits
instead of arriving from a stranger.

## 10. Unsubscribe means deleted

Every email the engine sends — cold, follow-up, demo — carries a one-click link
(`/u/<token>`) and the RFC 8058 headers, so Gmail and Outlook show their own
Unsubscribe button. A reply like "תסירי אותי" or "unsubscribe" does the same.

Either way the address goes onto `outbound_suppressions` and **everything else
is deleted**: the prospect row, the whole conversation, the platform lead and
its events. There is nothing left to restore, which is the point. A later CSV
carrying that address imports it as `suppressed` and it is never mailed.

Opening the link never unsubscribes anyone by itself — mail scanners follow
links — so the page asks first and the button does the work.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `unauthorized_client` | Delegation scopes in the Admin console differ from the two above, or the client id is wrong |
| `invalid_grant` / `Invalid email or User ID` | The mailbox is not a user on the domain, or is suspended |
| `Precondition check failed` (400) | Impersonating an address the service account may not act as — usually a non-Workspace address |
| Test send works, cron sends nothing | Outside the send window, all mailboxes at cap, no active campaign, or the bearer digest does not match (`401` in the pg_cron log) |
| Replies not arriving | Mailbox `last_error` on `/admin/outbound`; `gmail.readonly` missing from the delegation |
