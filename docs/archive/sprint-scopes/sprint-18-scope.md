# Sprint 18 — Super Admin Dashboard

*Status: Planned*
**Branch:** `sprint-18`
**Depends on:** Sprint 17 complete + at least 3 paying customers

**Goal:** Give the platform operator a separate admin surface to manage organizations, onboard new customers, troubleshoot safely, and monitor platform health without direct SQL or Supabase dashboard work.

---

## Pre-Sprint State

After Sprint 17, the product is strong inside a single organization but platform operations are still manual:

1. There is no platform-level role. Every authenticated session assumes an org-bound `organization_id`.
2. There is no separate `/admin` route tree. Cross-org operations require direct DB access or Supabase Auth admin usage.
3. New customer onboarding is manual: create organization, invite owner, seed defaults, and verify setup by hand.
4. There is no single place to see org health across the platform: activity, WhatsApp connection, payment connection, or setup completeness.
5. There is no safe support flow for entering an org context while preserving auditability and server-side permission checks.

---

## Scope Summary

This sprint adds the minimum platform-ops foundation:

- `superadmin` auth role
- Separate `/admin/*` route tree and layout
- Platform KPI dashboard
- Organizations list with derived health signals
- New organization onboarding flow
- Organization detail page with editable core settings
- Read-only support mode ("impersonation" for troubleshooting)
- Billing readiness page (not automated subscription billing)

---

## Architectural Decisions (Locked)

1. `profiles.role` gains `superadmin`.
2. `profiles.organization_id` becomes nullable, and **must be `NULL` for `superadmin`**.
3. Existing org-scoped RLS policies remain unchanged. Sprint 18 does **not** add platform-wide RLS access to business tables.
4. All `/admin/*` data access uses server-side guards plus `createServiceRoleClient()`. No cross-org queries from the client.
5. Superadmin users get a completely separate route tree and shell. They do not reuse the normal dashboard layout/sidebar.
6. "Impersonation" in Sprint 18 is **read-only support mode** with an explicit banner and fixed TTL. Full write-capable impersonation is deferred.
7. Superadmin creation is DB-only. There is no dashboard UI to grant or revoke this role.
8. New org onboarding must be resilient: if invite/profile creation fails after the org row is created, the action performs compensating cleanup.

---

## Story 0 — Schema + Session Foundation

### Migration

**`supabase/migrations/20260417000001_superadmin_dashboard.sql`** (new)

```sql
ALTER TABLE profiles
  DROP CONSTRAINT profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'teacher', 'superadmin'));

ALTER TABLE profiles
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_superadmin_org_check
  CHECK (
    (role = 'superadmin' AND organization_id IS NULL) OR
    (role <> 'superadmin' AND organization_id IS NOT NULL)
  );
```

### Session/Auth Refactor

Current `getSession()` always returns `orgId: string`, which is no longer valid once `superadmin` exists.

Split auth helpers into explicit contracts:

- `requireDashboardSession()` -> only `owner | admin | teacher`, always returns `orgId`
- `requireSuperAdminSession()` -> only `superadmin`, returns no `orgId`
- optional low-level `getSession()` -> discriminated union if still needed

### Route Protection

- Extend `src/proxy.ts` to protect `/admin/*` the same way dashboard routes are protected
- Authenticated superadmin at `/login` redirects to `/admin/dashboard`
- Authenticated non-superadmin attempting `/admin/*` gets redirected or `forbidden()`

**Files changed:**
- `supabase/migrations/20260417000001_superadmin_dashboard.sql`
- `src/lib/auth/session.ts`
- `src/proxy.ts`
- `src/lib/superadmin/session.ts` (new)

---

## Story 1 — Admin Route Group + Shell

Create a separate route group for platform operations:

- Route group: `src/app/(admin)/admin/`
- Main nav items:
  - `/admin/dashboard`
  - `/admin/orgs`
  - `/admin/billing`

### Layout Rules

- Dedicated admin layout and sidebar
- Different visual shell from the normal org dashboard
- Top-level header includes current superadmin name and a clear "Platform Admin" label
- No org-scoped dashboard nav items appear here

### Redirect Rules

- Superadmin visiting `/dashboard` -> redirect to `/admin/dashboard`
- Org users visiting `/admin/*` -> `forbidden()`

**Files created/changed:**
- `src/app/(admin)/admin/layout.tsx`
- `src/app/(admin)/admin/dashboard/page.tsx`
- `src/app/(admin)/admin/orgs/page.tsx`
- `src/app/(admin)/admin/billing/page.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/components/admin/AdminHeader.tsx`
- `src/app/(dashboard)/layout.tsx`

---

## Story 2 — Platform Dashboard

Page: `/admin/dashboard`

### KPI Cards

1. `totalOrganizations` — total org count
2. `activeOrganizationsLast30Days` — orgs with platform activity in the last 30 days
3. `platformLessonsThisMonth` — total lessons this calendar month
4. `platformRevenueThisMonth` — sum of paid charges this calendar month

### Secondary Panels

- "Needs setup" list:
  - missing WhatsApp connection
  - missing payment provider
- "Recently active orgs" list:
  - org name
  - last activity
  - quick link to org detail

### Definitions

- **Revenue:** `charges.status = 'paid'`
- **Last activity:** greatest recent timestamp across lesson update, charge update, or lead update for that org
- **Active org (30d):** `lastActivity >= now() - interval '30 days'`

Implementation may use either:

- a server-side query helper in `src/lib/superadmin/dashboard.ts`, or
- a single SQL view/RPC if the query becomes too expensive/noisy in application code

Default choice: start with a pure TypeScript data-layer helper and move to SQL only if needed.

**Files created:**
- `src/lib/superadmin/dashboard.ts`
- `src/app/(admin)/admin/dashboard/page.tsx`
- `src/components/admin/PlatformKpiGrid.tsx`
- `src/components/admin/NeedsSetupList.tsx`
- `src/components/admin/RecentOrgsList.tsx`

---

## Story 3 — Organizations List

Page: `/admin/orgs`

### Table Columns

- Organization name
- Slug
- Timezone
- Derived status
- Last activity
- WhatsApp connected (`Y/N`)
- Payment connected (`Y/N`)
- Receipt provider connected (`Y/N`)
- Created at
- Actions: `View`, `Support mode`

### Derived Status (not persisted)

Because automated SaaS billing does not exist until Sprint 21, `status` is operational, not subscription-based:

- `needs_setup` -> missing WhatsApp or missing owner profile
- `active` -> has activity in last 30 days
- `inactive` -> otherwise

### Filters

- Search by org name or slug
- Filter by status
- Filter by "missing setup"

Default choice: server component page with URL query params for filters. No client-side data grid library.

**Files created:**
- `src/lib/superadmin/organizations.ts`
- `src/app/(admin)/admin/orgs/page.tsx`
- `src/components/admin/OrganizationsTable.tsx`
- `src/components/admin/OrganizationStatusBadge.tsx`
- `src/components/admin/OrganizationFilters.tsx`

---

## Story 4 — Create Organization Flow

Page: `/admin/orgs/new`

### Form Fields

- `name`
- `timezone`
- `owner_email`
- `owner_full_name`

`owner_full_name` is required because `profiles.full_name` is required in the live schema.

### Creation Steps

1. Validate input with Zod
2. Generate unique slug from org name
3. Insert `organizations` row
4. Insert default `cancellation_policies` row
5. Invite owner via Supabase Auth admin API
6. Insert `profiles` row for the owner with `role = 'owner'`
7. Redirect to `/admin/orgs/[id]`

### Failure Handling

This flow crosses both Auth Admin and Postgres, so it cannot be a single DB transaction.

Required compensating behavior:

- If invite fails -> delete the newly created org row before returning error
- If profile insert fails after invite -> delete invited user and org row before returning error
- All failures log structured context (`orgId`, `ownerEmail`, failing step)

### Defaults Created at Onboarding

- `organizations.timezone` = selected value
- `organizations.break_duration_minutes` = `0`
- `organizations.min_booking_notice_hours` = `0`
- `organizations.billing_mode` = `'monthly'`
- `cancellation_policies` row with existing platform defaults (`24 / 2 / 50`)

### Explicitly Not Included

- Auto-connect WhatsApp
- Auto-connect payment provider
- Seed demo parents/students/teachers
- Self-serve customer signup page

**Files created/changed:**
- `src/app/(admin)/admin/orgs/new/page.tsx`
- `src/app/(admin)/admin/orgs/actions.ts`
- `src/components/admin/NewOrganizationForm.tsx`
- `src/lib/superadmin/createOrganization.ts`

---

## Story 5 — Organization Detail Page

Page: `/admin/orgs/[id]`

### Read-Only Summary

- Organization identity: name, slug, timezone, created at
- Core operational settings:
  - break duration
  - minimum booking notice
  - billing mode
- Connection status:
  - WhatsApp connected
  - payment provider connected
  - receipt provider connected
- Counts:
  - active teachers
  - active students
  - pending charges
- Recent activity timestamp

### Editable Fields (MVP)

Only edit low-risk core settings in Sprint 18:

- `name`
- `slug`
- `timezone`
- `break_duration_minutes`
- `min_booking_notice_hours`
- `billing_mode`

### Not Editable Here

- Encrypted credentials
- WhatsApp access token data
- Payment provider secrets
- Receipt provider secrets

Those remain in the org's own owner settings area.

**Files created:**
- `src/app/(admin)/admin/orgs/[id]/page.tsx`
- `src/app/(admin)/admin/orgs/[id]/actions.ts`
- `src/components/admin/OrganizationDetailCard.tsx`
- `src/components/admin/OrganizationSettingsForm.tsx`

---

## Story 6 — Read-Only Support Mode

Entry point: action button from `/admin/orgs` and `/admin/orgs/[id]`

### Goal

Allow the platform operator to inspect an org's dashboard context for support/debugging **without** granting cross-org write power in Sprint 18.

### Behavior

- Superadmin starts support mode for a target org
- Server creates a signed, httpOnly support cookie with:
  - target org id
  - superadmin user id
  - issued at
  - expires at
- TTL: 30 minutes
- User is redirected into the normal dashboard in support mode
- A persistent top banner shows:
  - target org name
  - remaining time
  - "Exit support mode" action

### Sprint 18 Restriction

Support mode is **read-only**:

- Read access allowed to dashboard/reporting/listing pages needed for support
- Mutating server actions remain blocked
- UI buttons for create/update/delete flows are hidden or disabled when support mode is active

### Auditability

Log start and end events with:

- superadmin id
- target org id
- timestamp
- reason (optional free text if easy to add in the form)

Default choice: structured server logs only. Dedicated audit table is deferred unless logging proves insufficient.

**Files created/changed:**
- `src/lib/support-session/index.ts`
- `src/components/dashboard/SupportModeBanner.tsx`
- `src/app/(admin)/admin/orgs/[id]/StartSupportModeButton.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/lib/auth/session.ts`

---

## Story 7 — Billing Readiness Page

Page: `/admin/billing`

Sprint 21 will add real SaaS billing. Sprint 18 only adds platform visibility so operations are not blind.

### Table Columns

- Organization
- Payment provider connected (`Y/N`)
- Receipt provider connected (`Y/N`)
- First paid charge date
- Total paid revenue to date
- Last paid charge date

### Purpose

- Identify orgs that are live enough to migrate into real subscription billing later
- Give the operator a simple billing-readiness queue

### Important Clarification

This page does **not** implement:

- plans
- invoices
- subscriptions
- Stripe
- automatic charging of Lessio customers

**Files created:**
- `src/app/(admin)/admin/billing/page.tsx`
- `src/components/admin/BillingReadinessTable.tsx`
- `src/lib/superadmin/billing.ts`

---

## No New Dependencies

Sprint 18 should ship with the existing stack. No additional UI table library or auth package is required.

---

## Suggested Delivery Order

To keep the sprint reviewable, ship in this order:

1. Story 0: schema + session helpers + `/admin` route protection
2. Story 1: admin shell and base navigation
3. Story 2 + Story 3: dashboard and org list
4. Story 4: create organization flow
5. Story 5: org detail page
6. Story 7: billing readiness
7. Story 6: support mode (last, because it has the highest security/UX risk)

If time is tight, the cut line is **after Story 5**. Support mode is the first deferral candidate.

---

## Test Plan

### Automated

- Unit tests for `requireDashboardSession()` and `requireSuperAdminSession()`
- Unit tests for derived org status logic (`needs_setup`, `active`, `inactive`)
- Server action tests for org creation success and rollback paths
- Route protection tests for `/admin/*`
- Support cookie validation tests (signature, expiry, org targeting)

### Manual QA

1. Login as superadmin -> lands on `/admin/dashboard`
2. Login as owner/admin/teacher -> `/admin/*` is forbidden
3. Create org -> owner invite sent, profile created, org detail loads
4. Create org failure path -> no partial org/user remains
5. Org list badges reflect connection status correctly
6. Support mode banner appears and all mutations remain blocked
7. Exit support mode restores normal superadmin admin shell

---

## Security Notes

- Superadmin role can only be granted manually in DB or controlled back-office tooling, never from the product UI
- All admin mutations validate input with Zod on the server
- All `/admin/*` pages use explicit superadmin guards before any service-role query runs
- No secret values are ever rendered in the platform admin UI; only boolean connection state and provider names
- Support mode is time-boxed, bannered, and read-only in Sprint 18
- Existing org RLS boundaries remain intact; platform queries bypass them only from trusted server code

---

## Out of Scope

- Full write-capable impersonation
- SaaS subscriptions and plan charging
- Customer self-serve signup/checkout
- Usage metering
- Superadmin management UI
- Platform audit table / SOC-style audit trail UI
- Cross-org analytics beyond the KPI cards and readiness tables above
