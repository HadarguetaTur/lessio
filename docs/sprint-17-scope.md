# Sprint 17 — Analytics & Reporting
*Status: ✅ Done*

---

## Goal

Give owners and admins a dedicated reporting section with interactive charts, tabular data, and CSV export for all key business metrics. Extend the KPI dashboard with 3 new actionable indicators. Clean up the deprecated WhatsApp send helpers introduced in Sprint 15–16.

---

## Stories

### Story 0 — Sprint 16 Cleanup

Delete 11 `@deprecated` WhatsApp send helper functions from `src/lib/whatsapp/index.ts`.

All call sites were already migrated to `resolveTemplate` + `sendTextMessage` in Sprint 16.  
Update the two unit tests (`webhook.test.ts`, `actions.test.ts`) to mock the new API.

**Deleted functions:**
`sendBookingLink`, `sendBookingConfirmation`, `sendCancellationConfirmation`, `sendCancellationAdminAlert`, `sendBalanceReply`, `sendScheduleReply`, `sendReceiptReply`, `sendPortalReply`, `sendReceiptMessage`, `sendUnknownIntentReply`, `sendHomeworkReminder`

**Files changed:**
- `src/lib/whatsapp/index.ts`
- `src/app/api/whatsapp/webhook/webhook.test.ts`
- `src/app/book/[token]/actions.test.ts`

---

### Story 1 — Data Layer (`src/lib/reports/`)

Pure server-side query functions. No new DB migrations needed — all data exists.

| File | Function | Description |
|------|----------|-------------|
| `revenue.ts` | `getRevenueReport(orgId, timezone, months)` | Paid charges grouped by month |
| `lessons.ts` | `getLessonsReport(orgId, timezone, months)` | Lessons and cancellations by month |
| `debt.ts` | `getDebtReport(orgId)` | Parents with pending charges, sorted by debt desc |
| `teachers.ts` | `getTeachersReport(orgId, timezone, months)` | Lessons count + revenue per teacher |
| `students.ts` | `getStudentsReport(orgId, timezone)` | Active students with lesson activity; at-risk flag |
| `index.ts` | — | Re-exports all above |

**At-risk definition:** `lessonsLast30Days === 0` for an active student.

---

### Story 2 — Reports Navigation + Landing Page

Add a `דוחות` section to the sidebar (owner/admin only). Create a `/reports` landing page with card links to each sub-report.

**Files changed:**
- `src/components/dashboard/Sidebar.tsx` — add `reports` section above `settings`
- `src/app/(dashboard)/reports/page.tsx` — landing page (new)

---

### Story 3 — Revenue Report

Page: `/reports/revenue`  
Chart: Bar chart — monthly revenue (₪) over selected period  
Table: Months in reverse chronological order with revenue amounts  
Period: Configurable via `?months=N` (default 12)

**Files created:**
- `src/app/(dashboard)/reports/revenue/page.tsx`
- `src/components/reports/RevenueChart.tsx`

---

### Story 4 — Lessons Report

Page: `/reports/lessons`  
Chart: Grouped bar chart — scheduled lessons vs cancellations by month  
Table: Month | Lessons | Cancellations  
Period: Configurable via `?months=N` (default 12)

**Files created:**
- `src/app/(dashboard)/reports/lessons/page.tsx`
- `src/components/reports/LessonsChart.tsx`

---

### Story 5 — Debt Report

Page: `/reports/debt`  
No chart. Tabular: Parent name | Phone | Total debt (₪) | Oldest due date  
Sorted by total debt descending. Shows "אין חובות פתוחים 🎉" when empty.

**Files created:**
- `src/app/(dashboard)/reports/debt/page.tsx`

---

### Story 6 — Teachers Report

Page: `/reports/teachers`  
Chart: Horizontal bar chart — lessons count per teacher  
Table: Teacher name | Lessons | Revenue (₪)  
Period: Configurable via `?months=N` (default 3, max 12)

**Files created:**
- `src/app/(dashboard)/reports/teachers/page.tsx`
- `src/components/reports/TeachersChart.tsx`

---

### Story 7 — Students Report

Page: `/reports/students`  
No chart. Shows at-risk alert block (red pills) for students with no lesson in 30 days.  
Full table: Student | Lessons (30d) | Last lesson date | Status badge (פעיל/בסיכון)

**Files created:**
- `src/app/(dashboard)/reports/students/page.tsx`

---

### Story 8 — CSV Export API + Shared Components

**API:** `GET /api/reports/[report]?months=N`  
Requires authenticated session (owner/admin). Returns UTF-8 CSV with BOM for Hebrew Excel compatibility.  
Supported reports: `revenue`, `lessons`, `debt`, `teachers`, `students`

**Shared client components:**
- `CsvDownloadButton` — triggers download by creating a temporary `<a>` tag
- `PeriodSelector` — `<select>` that writes `?months=N` to the URL (uses `useRouter`)

**Files created:**
- `src/app/api/reports/[report]/route.ts`
- `src/components/reports/CsvDownloadButton.tsx`
- `src/components/reports/PeriodSelector.tsx`

---

### Story 9 — KPI Dashboard Enhancement

Extend `getDashboardStats` with 3 new KPIs and display them as a second row of KPI cards on `/dashboard`.

| KPI | Metric | Highlight |
|-----|--------|-----------|
| `cancellationRateThisMonth` | % of all lessons this month that were cancelled | ≥ 20% |
| `atRiskStudents` | Active students with 0 lessons in last 30 days | > 0 |
| `newLeadsThisMonth` | New leads created this calendar month | — |

**Files changed:**
- `src/lib/dashboard/stats.ts` — add 3 fields to `DashboardStats` type + extend query
- `src/app/(dashboard)/dashboard/page.tsx` — add second KPI row (3 cards in a 3-col grid)

---

## New Dependency

| Package | Version | Reason |
|---------|---------|--------|
| `recharts` | `^3.8.1` | Interactive charts (bar charts for revenue, lessons, teachers) |

---

## Out of Scope (Deferred)

- PDF export — deferred to Sprint 18
- Per-student revenue drill-down
- Chart animations / advanced interactions
- Date-range picker (uses month count only)
- Comparison to previous period

---

## Security Notes

- All report pages and the CSV API require an active session with `owner` or `admin` role.
- Report data is always scoped to `session.organizationId` — no cross-org leakage possible.
- CSV endpoint validates session server-side before any DB query.
