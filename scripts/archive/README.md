# scripts/archive/

Scripts that have already run and will not run again. They are kept because
they explain why production data looks the way it does — not because anyone
should execute them.

Nothing here is re-runnable as committed: the Airtable scripts read JSON
extracts that were deliberately never committed (customer data), and the rest
patch gaps that are now closed in the product itself.

## רז מזוריק — Airtable migration (August 2026)

| Script | What it did |
| --- | --- |
| `migrate-raz-airtable.ts` | Phase 1, ran 24.08.2026. Imported the historical Airtable base into the existing org — teachers, parents, students, lessons, subscriptions, groups, homework, cancellation events and monthly billing, all under the deterministic `a1000000-` prefix. Historical amounts were imported as recorded; the billing engine was deliberately not re-run over past months |
| `migrate-raz-airtable-phase2.ts` | Phase 2. Backfilled the charges ledger from approved historical billing months (so the debt KPI reflects history), converted the Airtable weekly-slot grid into `availability` windows, and turned reserved slots into `lesson_series` + generated weekly lessons |
| `fix-raz-pricing.ts` | Repaired three pricing errors the import introduced, found in the 26.08.2026 audit: pair prices were the pair total copied into `price_per_student` (halved), the individual rate came from `teachers.hourly_rate` 150 which is teacher pay rather than the 175 customer rate, and generated group lessons had a NULL price falling back to the org default instead of 150/student |

## Closed product gaps

| Script | What it did |
| --- | --- |
| `backfill-waba-subscriptions.ts` | Subscribed the Meta app to WABAs connected before Sprint 30, when Embedded Signup stored the token but never called `subscribed_apps` — so Meta delivered no message webhooks for them. New connections do this themselves |
| `register-templates-v2.ts` | Rolled the rewritten `_v2` templates out to WABAs connected before Sprint 32. New connections get them from `registerTemplatesForWABA` during Embedded Signup |
| `fix-demo-reminders-once.ts` | Opted the fictional 555-01xx demo parents out of reminders and cleared the failed `lesson_reminder` rows, so the reminders page was clean for App Review. The opt-out is now baked into `seed-review-demo.ts` |

Also removed in this cleanup, and recoverable from git history: `seed-demo-data.ts`,
the original `d1000000-` demo tenant seed. It had been marked obsolete since
17.08.2026 — its target org and owner account were deleted, so it failed on
startup. `seed-review-demo.ts` replaced it.
