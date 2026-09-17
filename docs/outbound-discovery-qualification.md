# Cold discovery qualification

Status: deployed to production on 2026-09-17 (migration first, then code). Founder-approved scope.
The staging-first gate was skipped by founder decision; see the last section.

## Eligibility

Cold discovery targets Israeli tutoring businesses with exactly 2–5 teachers.
The secondary 6+ teacher Center audience remains an inbound audience, not a cold
collection target. Solo tutors, colleges, schools, universities and large chains
are outside this flow. Google Places collection checks the country component
rather than relying on a regional search bias.

A candidate must have an explicit, quoted total-team count on its own website,
a sourced email, two distinct facts, score >=70, and the existing grounded opener.
Team evidence accepts numeric and Hebrew number-word statements, including
“צוות של שלושה מורים”. Team pages have priority in the four-page research budget.
Generic “צוות מורים”, class size, years of experience and an incomplete list of
teacher profiles do not prove a total. Unknown or conflicting counts remain in
the internal research records and never appear as outreach proposals. This is
conservative: a valid business without explicit public evidence will not appear.
Transient fetch/model failures retain the existing bounded retry policy; missing
team-size evidence is held, not repeatedly polled or guessed.

## Business identity and memory

The service-role-only outbound_business_history table stores hashed identity
keys, a reason and a timestamp. Identities are exact normalized email, business
host (website or business email domain), normalized phone, and Places id. Public
mail providers, social sites and shared hosting/directory hosts do not identify a
whole business. Names alone are deliberately not used to merge businesses.
Different email addresses on the same business domain therefore match; unrelated
Gmail addresses do not. A wholly changed business identity without a common key
cannot be recognized automatically.

Prospects are remembered at queue entry, across every campaign and status, not
only after a successful send. Rejected, deleted and approved candidates, and
email suppressions, are remembered as well. Deletes preserve only these minimal
keys in the memory table. The memory is independent of foreign-key cascades.
Manual editing cannot reopen a rejected candidate.

Collection refuses known or explicitly excluded businesses. Research updates
recheck history. The proposal-list RPC filters before pagination and collapses
multiple qualified places for one business. Both approval modes share a
serialized business-history check followed by the original campaign, evidence,
lease and grounded-opener checks. The old internal promotion function is not
executable by the service-role API, so it cannot bypass the new gate.

## Migration and release

Apply 20260917140000_outbound_business_qualification.sql before the application
release. It backfills memory from existing prospects, reviewed candidates and
suppressions, removes known businesses from active research, and requeues all
remaining unpromoted proposals for qualification. Sent conversations, existing
prospect send queues and manual rejection decisions are preserved. Records
permanently deleted before this migration cannot be reconstructed unless their
identifiers remain in those existing sources.

Follow the repository staging-first release gate. This work does not run live
collection or send emails. After deployment, existing research crons repopulate
the list only with qualified proposals; the list can initially be empty.

Validation: outbound Vitest suite, isolated PGlite migrations including an upgrade
from existing sent/rejected/pending rows, TypeScript, and targeted ESLint.
Production verification is still required before describing this as live.

Google address component reference:
https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#AddressComponent

## Staging preflight (2026-09-17)

Deployment not performed. Vercel project `lessio` currently has the same
Supabase URL and credentials configured jointly for Production and Preview.
The linked Supabase project is `iesxiouhgdxmymveikxh` (`lassio`); its branch
list is empty, and no separate Lessio staging project was found in the
authenticated project list. A Vercel Preview alone is therefore not an
isolated database test environment. No remote migrations or email sends ran.

Proposed next step: provision a temporary Supabase branch named
`outbound-qualification-qa`, validate its isolated project ref, apply and test
the migration there with synthetic data, and deploy a dedicated Vercel Preview
with deployment-specific database credentials. Do not copy production cron jobs
or enable outbound email transport. The paid branch requires owner approval
before provisioning. Do not change the shared Production/Preview variables.

## Production release (2026-09-17)

The founder chose to skip the staging branch. Migrations 20260917120000 and
20260917140000 were applied to production with `supabase db push` after a dry
run showed only those two pending; the code followed on main (8573a9f).
Right after the migration: 152 identity keys in outbound_business_history,
4 candidates requeued for research, 0 eligible proposals. An empty list is the
expected starting state until the research cron requalifies candidates.
