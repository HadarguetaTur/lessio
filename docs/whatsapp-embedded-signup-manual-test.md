# Embedded Signup — manual test

How to run the Connect WhatsApp flow end to end and confirm the one thing Meta's
`api_precheck` step actually looks for: a successful call made with
`whatsapp_business_management`.

Written against Graph **v26.0** (`src/lib/whatsapp/graphVersion.ts`).

---

## 0. Dashboard prerequisites — check these first

The flow **cannot** render the Embedded Signup dialog until these are true on the
Meta side. Until then the popup shows the fallback lead form
("onboarding is not currently available for … — share your contact details"),
and no amount of local debugging changes that.

| # | Check | Where |
|---|---|---|
| 1 | `whatsapp_business_management` and `whatsapp_business_messaging` are at **Advanced Access** | App Dashboard → App Review → Permissions and Features |
| 2 | App is **Live**, not `dev_mode` | App Dashboard → top toggle |
| 3 | Tech Provider onboarding complete for the business portfolio | Business Settings |
| 4 | The Login Configuration in `NEXT_PUBLIC_META_CONFIG_ID` is a **Facebook Login for Business** config of type **WhatsApp Embedded Signup**, requesting both WhatsApp permissions | App Dashboard → Facebook Login for Business → Configurations |
| 5 | `http://localhost:3000` is in **Allowed Domains for the JavaScript SDK** (only `https://www.getlessio.com/` is there today, so the SDK is not authorised on localhost) | App Dashboard → Settings → Advanced |

Steps 1–4 are also what unblocks App Review itself. Step 5 is only needed for
local testing.

## 1. Environment

`.env.local` needs all four:

```
META_APP_ID=…
META_APP_SECRET=…
NEXT_PUBLIC_META_CONFIG_ID=…      # the config from prerequisite 4 — never a placeholder
WHATSAPP_REGISTER_PIN=……          # exactly 6 digits
```

Missing `META_APP_ID` or `NEXT_PUBLIC_META_CONFIG_ID` makes the page render a
named "not configured" message instead of the button — that is the intended
behaviour, not a bug. A `WHATSAPP_REGISTER_PIN` that is absent or not six digits
fails the save before any Meta call.

```bash
npm run dev
```

## 2. Walk the flow

1. Sign in as an **owner** (the page is owner-only) and open
   http://localhost:3000/settings/whatsapp
2. Open DevTools → Console before clicking, and keep it open. Every
   `WA_EMBEDDED_SIGNUP` message is logged on the error path.
3. Click **Connect**. Expect Meta's Embedded Signup dialog: business selection →
   WABA selection → phone number → permissions review.
4. Complete it with a real number you control.

On success the hidden form submits once and the page re-renders showing the
connected `phone_number_id`.

### Server log on success, in order

One sequential pass, one round-trip per step:

```
[subscribeApp] WABA <waba> subscribed to app
[whatsapp/settings] WhatsApp connected { orgId, phoneNumberId, wabaId }
```

The full sequence behind those lines is: exchange code → `debug_token` →
`subscribed_apps` → `register` → encrypt → persist → register templates
(fire-and-forget).

### Failure cases worth provoking

Each must produce a **visible message**, never a silent no-op:

| Do this | Expect on screen |
|---|---|
| Click Connect, then close the popup immediately | "The Meta window closed before the connection finished. Nothing was saved…" |
| Abandon mid-flow (e.g. at phone verification) | "The connection was not completed. Meta stopped at: phone number verification." |
| Create a WABA but add no phone number | "A WhatsApp Business account was selected but no phone number was connected…" |
| Block `connect.facebook.net` in DevTools → Network, reload | "Facebook's login script did not load. Disable any ad or content blocker…" |
| Run before prerequisite 1 is granted | "Meta did not grant the permissions this connection needs (…)" — from `debug_token`, before anything is persisted |

Also worth confirming: navigate away to another settings page and back, then run
the flow again. It must still work — the `message` listener is registered on
every mount, so a client-side navigation no longer leaves the page deaf.

## 3. Confirm the `whatsapp_business_management` call — the `api_precheck` bit

The script for this already exists and is what generates the traffic Meta looks
for. It exercises both permissions against the demo WABA:

```bash
npx tsx scripts/meta-precheck-calls.ts            # read-only calls + one real send
npx tsx scripts/meta-precheck-calls.ts --no-send  # skip the outbound message
```

It needs `WHATSAPP_DEMO_ACCESS_TOKEN` in `.env.local` — a 24h token from
App Dashboard → WhatsApp → API Setup. It expires daily; a 401 means refresh it.

Expected tail:

```
✓ whatsapp_business_management: 4/4 successful call(s)
✓ whatsapp_business_messaging: 2/2 successful call(s)

Both permissions now have successful calls on record.
```

A non-zero exit means at least one permission still has no successful call.

To check the org you just connected rather than the demo WABA — this is the call
that proves the *connected* token works, using the credentials the flow stored:

```bash
npx tsx scripts/check-stored-whatsapp-token.ts
```

It decrypts the stored token, calls `debug_token`, and reads the phone number
back. Read-only: it sends nothing and writes nothing.

Meta refreshes `api_precheck` with a delay — re-check App Review status a few
hours after the calls succeed, not immediately.

## 4. Reset between attempts

Use **Disconnect** on the settings page. It unsubscribes the WABA from the app
(best-effort) and clears all three columns, so the next run starts clean.
Re-running signup afterwards is safe: both `subscribed_apps` and `register` are
idempotent on Meta's side.
