# Agent policy — how an AI coding agent works in this repo

Adopted 2026-09-16 (Phase 2 of the AI-native engineering plan). Short by design;
the reasoning lives in the plan that produced it.

## The boundary (three independent "no"s)

1. **No production credential on an agent machine.** `.env.local` points at the
   shared dev/preview Supabase project, never at production. Production values
   exist only in Vercel and Supabase secrets. Prod CLI work happens in a
   separate human OS session (`lessio-ops`), never from an agent checkout.
2. **The agent's GitHub identity is `lessio-agent`**, a machine account whose
   fine-grained token can write branches, PRs and issues on this repo — and
   nothing else (no admin, no secrets, no Actions).
3. **`main` accepts only merged PRs** (ruleset: PR + `ci` check + one approval +
   Code Owners, no force-push, no bypass for the bot). Merging `main` is the
   production deploy.

`.claude/settings.json` (versioned) is defence-in-depth on top of these. It is
never the thing that keeps production safe.

## Risk classes — by path, and only ever escalated

The labeler marks a PR `risk:green|yellow|red` from `.github/labeler.yml`; the
class of the PR is the **highest** label present. A reviewer may raise a class,
never lower it.

| Class | What it is | Agent may | Merge needs |
|---|---|---|---|
| **GREEN** | docs, copy (`messages/*`), tests, presentational UI, safe refactors | implement end-to-end, open PR | CI + one approval |
| **YELLOW** | billing, charges, cancellation, scheduling, lessons, booking, WhatsApp, AI copilot, auth/JWT/portal, SaaS logic, payment/receipt adapters, Google Calendar/Gmail OAuth and token handling, cron route logic, edge functions, **additive** migrations, `env.ts`, `CLAUDE.md` | implement with a failing-then-passing regression test; state Node/Deno mirror parity | CI + Hadar as code owner |
| **RED** | anything that changes production *state or configuration*: data-mutating or destructive migrations, `setup-crons.sql`, `config.toml`, `proxy.ts` bypass list, cron auth, crypto, provider config decoding, Sumit credentials, ops scripts, `.github/`, `.env*`, `docs/ops/`, real-tenant data | investigate and propose only (issue comment or draft PR); never run it | Hadar authors and performs it |

Human-only in V1, regardless of class: applying migrations, deploying edge
functions, changing crons, secrets, Vercel/Supabase config, Meta/WABA or
payment-provider configuration, touching a real tenant's rows.

## Bug-fix contract (the PR template asks for each line)

0. Scope check — is the issue green/yellow? If the fix needs a red path, stop
   and comment `needs-ops`.
1. Read the issue, the linked dev-issue context, and `docs/decisions.md` for
   the area.
2. Establish evidence: reproduce against dev, or cite fingerprint/stack/route;
   say explicitly when it is not reproducible.
3. Root cause in one paragraph, with file:line.
4. Regression test that fails before and passes after. Deno code gets a
   Node-side test plus the parity test. Skipping needs a written reason.
   4b. Mirror check: `DEFAULT_TEMPLATES` / `botStrings` / threshold /
   fingerprint → both Node and Deno copies; `messages/*.json` → both `he` and `en`.
5. Smallest safe fix. No drive-by refactors, no new dependencies, no migration
   unless the issue is yellow and the migration is additive.
6. `npm run lint` · `npx tsc --noEmit` · `npx vitest run` · `npm run build`.
7. Branch `fix/<issue>-<slug>`, title `fix(<area>): …`, body `Closes #N`.
8. Explain root cause · change · test evidence · risk class · **what was NOT
   tested** · ops needed after merge.

## Branch and worktree hygiene

- Never work on `main`. One worktree per session (`.claude/worktrees/`), based
  on `origin/main` — not on the remote HEAD.
- Never mass-add untracked files. An untracked file is traced to the session
  and feature that produced it before it is committed.
- Ops scripts refuse a non-local, non-dev Supabase unless run with
  `LESSIO_TARGET=production … --i-know-this-is-prod` (`scripts/_lib/target.ts`).
  Set `LESSIO_DEV_SUPABASE_REF` in `.env.local` to name the dev project.

## Labels

`bug` · `auto-filed` (error-monitor) · `needs-triage` · `agent-ok` (a human
cleared it for an agent) · `risk:green` / `risk:yellow` / `risk:red` ·
`needs-migration` · `needs-edge-deploy` · `needs-ops`.
