# Sprint 28 — Analytics Pro + Production Closure
*Branch: `sprint-28`*
*Depends on: Sprint 27 complete*

---

## מצב נוכחי: סיכום מה הושג

### ✅ Sprint 26 — Parent Portal 2.0 (Done)

כל הקומפוננטות קיימות: `PortalScheduleView`, `PortalCancelDialog`, `PortalMessageThread`, `PortalProgressView`, `PortalTabBar` + כל ה-routes (schedule, progress, messages) + מיגרציה `20260503000001_sprint26_portal_v2.sql`.

### ⚠️ Sprint 27 — Billing & Accounting Pro (Partial → נסגר ב-Sprint 28)

**הושלם:**
- PDF invoice generation libs (`src/lib/billing/invoices/` — 6 קבצים)
- `generateAndStoreInvoice` נורה על אישור חיוב (fire-and-forget)
- `downloadInvoiceAction` + `DownloadInvoiceButton` פועלים
- iCount doctype 300 (חשבונית מס) + 330 (זיכוי)
- Green Invoice doctype 305/330
- `documentType` abstraction על ממשק `ReceiptProvider`
- Quota enforcement ב-`createStudentAction` + `createLessonAction`
- `QuotaExceededError` + error boundary ב-`error.tsx`
- Accounting export (`src/lib/reports/accounting.ts`) + `AccountingExportButton` בדוח הכנסות
- מיגרציה `20260603000001_sprint27_invoices_branding.sql`

**חסר מ-Sprint 27 — נסגר בסיפור 1:**

| פריט | מיקום |
|------|--------|
| עמודת download + badge זיכוי בטבלת חיובים | `billing/page.tsx` |
| ממשק לבחירת סוג מסמך (קבלה / חשבונית מס) | `settings/receipts/ReceiptSettingsForm.tsx` |
| Quota enforcement בנתיבי import + onboarding | `/api/import/execute/route.ts`, `ImportStudentsStep.tsx` |
| משתנים חסרים ב-`.env.local.example` | `RESEND_*`, `AI_CONFIG_ENCRYPTION_KEY` |

---

## מה חייב להיות לפני עליה לפרודקשן

| פריט | קריטיות | מצב |
|------|---------|-----|
| Quota enforcement בכל נתיבי mutation | **חייב** | ⚠️ חסר ב-import/onboarding |
| `.env.local.example` מלא + `release-checklist.md` מעודכן | **חייב** | ⚠️ חסר |
| Billing list — עמודת download | גבוה | ⚠️ חסר |
| Receipt settings — document type selector | גבוה | ⚠️ חסר UI |
| Dashboard KPI deltas + sparkline | בינוני | לא התחיל |
| Teacher performance report | בינוני | לא התחיל |
| Revenue forecasting widget | בינוני | לא התחיל |
| Student LTV | נמוך | לא התחיל |

---

## Closed Decisions (pre-sprint)

| Topic | Decision |
|---|---|
| Schema changes | אין — Sprint 28 לא מוסיף טבלאות. כל הנתונים קיימים ב-DB |
| KPI deltas | חישוב בצד שרת: `deltaPercent = ((current - prev) / prev) * 100`, ירוק/אדום לפי סימן |
| Revenue sparkline | Recharts `AreaChart`, 12 נקודות, minimal (ללא axes), query חדש ב-`src/lib/reports/revenue.ts` |
| Forecast | שאילתה על `lessons` status=scheduled + subscriptions בחודש נוכחי. "בסיכון" = תלמיד עם 2+ ביטולים ב-30 יום |
| Teacher performance | Tab חדש בדוח teachers הקיים (Sprint 17). אין route חדש |
| Student LTV | KPI card נוסף ב-Overview tab של פרופיל תלמיד. Query: sum paid charges since created_at |

---

## Context: What Was Already Built

| Feature | Status |
|---|---|
| Monthly billing engine (`buildStudentMonth`) | Done (Sprint 3/22) |
| PDF invoice libs + download action | Done (Sprint 27) |
| iCount/Green Invoice tax doc types | Done (Sprint 27) |
| Quota enforcement (students + lessons create) | Done (Sprint 27) |
| Accounting CSV export | Done (Sprint 27) |
| Revenue report + charts (Recharts) | Done (Sprint 17) |
| Teacher reports page | Done (Sprint 17) |
| Student profile tabs (Overview/Lessons/Homework/Billing/Notes) | Done (Sprint 24) |
| KpiCard component | Done (Sprint 9) |
| `requireQuotaCapacity` + `QuotaExceededError` | Done (Sprint 27) |
| Import flow (`/api/import/execute/`) | Done (Sprint 17) |

---

## Story 1 — Closure: Sprint 27 Gaps (production blockers)

### 1a — Billing list: download column + credit note badge

**Why:** חשבוניות שנוצרות ב-approve אינן גלויות בטבלת החיובים הראשית. מנהל לא יכול להוריד או לראות אם הונפקה חשבונית זיכוי.

**שינויים:**
- `src/app/(dashboard)/billing/page.tsx` — הוסף עמודה "חשבונית" בטבלה:
  - אם `invoice_number` קיים → כפתור הורדה (icon + מספר)
  - אם `credit_note_number` קיים → badge "זיכוי" (amber)
  - קישור ל-`downloadInvoiceAction` שכבר קיים ב-`billing/actions.ts`

### 1b — Receipt settings: document type selector

**Why:** `receipt_document_type` קיים ב-DB (מיגרציה Sprint 27) אבל אין ממשק לשינויו — כל הארגונים ברירת מחדל "קבלה".

**שינויים:**
- `src/app/(dashboard)/settings/receipts/ReceiptSettingsForm.tsx` — הוסף `RadioGroup`:
  - "קבלה (Receipt)"
  - "חשבונית מס (Tax Invoice)"
  - שמירה ל-`organizations.receipt_document_type` דרך server action קיים

### 1c — Quota enforcement: import + onboarding

**Why:** תלמיד יכול לעקוף את מגבלת ה-quota דרך import גדול. נגד הנחיית Sprint 27 שקבעה שכל נתיבי mutation מוגנים.

**שינויים:**
- `src/app/api/import/execute/route.ts` — הוסף `requireQuotaCapacity(orgId, 'students')` לפני ביצוע import של תלמידים (בדיקה של כמות הרשומות שעומדות להיכנס vs. מקום פנוי)
- `src/components/onboarding/steps/ImportStudentsStep.tsx` — אותו check בשלב onboarding

### 1d — `.env.local.example` completeness

**שינויים:**
- `.env.local.example` — הוסף 3 שורות חסרות:
  ```
  RESEND_API_KEY=
  RESEND_FROM_EMAIL=
  AI_CONFIG_ENCRYPTION_KEY=
  ```

---

## Story 2 — Analytics Core: Dashboard Upgrade

**Why:** המנהלים רואים כיום KPI cards סטטיות ללא הקשר. Δ vs. last month + sparkline הם ה-insight הכי שימושי שניתן להוסיף ללא schema חדש.

### 2a — KPI delta badges

**שינויים:**
- `src/lib/dashboard/kpis.ts` — הרחב query קיים: שלוף גם נתוני חודש קודם, חשב `deltaPercent`
- `src/components/dashboard/KpiCard.tsx` — הוסף prop `delta?: number`; render badge ירוק/אדום עם חץ ו-"X% vs. חודש קודם"
- KPIs מושפעות: הכנסות חודשיות, שיעורים שהתקיימו, תשלומים שהתקבלו, תלמידים פעילים

### 2b — Revenue sparkline + new KPIs

**שינויים:**
- `src/lib/reports/revenue.ts` — שאילתה חדשה: `getMonthlyRevenueTrend(orgId, 12)` → `{month, amount}[]`
- `src/components/dashboard/MiniRevenueChart.tsx` — קובץ חדש: `AreaChart` מינימלי (Recharts), 12 נקודות, ללא axes, גובה 60px
- `src/app/(dashboard)/dashboard/page.tsx` — הוסף `<MiniRevenueChart>` מתחת ל-KPI grid

**KPIs חדשים (3):**
- ממוצע הכנסה לתלמיד: `total_revenue_month / active_students`
- שיעורי ניצול מורה: `lessons_delivered / capacity` (%)
- שיעור המרת לידים: `converted_leads / total_leads` (30 ימים)

---

## Story 3 — Teacher Performance Report

**Why:** מנהל בית ספר צריך לראות עומס + ביטולים לפי מורה. הנתונים קיימים, חסרה ההצגה ההשוואתית.

### 3a — Query

- `src/lib/reports/teacherPerformance.ts` — קובץ חדש:
  ```typescript
  export async function getTeacherPerformance(
    orgId: string,
    months: number
  ): Promise<TeacherPerformanceRow[]>
  // TeacherPerformanceRow: { teacherId, name, lessonsDelivered,
  //   cancellationRate, avgMonthlyLessons, trendDelta }
  ```
  שאילתה: `lessons` grouped by `teacher_id`, filtered by `start_at` window

### 3b — UI

- `src/app/(dashboard)/reports/teachers/page.tsx` — **קיים** (Sprint 17); הוסף section "ביצועים השוואתיים":
  - טבלה: מורה / שיעורים / ביטולים% / ממוצע חודשי / טרנד (↑/↓/→)
  - `TeacherPerformanceTrendChart`: bar chart per teacher ל-3 חודשים אחרונים (Recharts `BarChart`)
  - PeriodSelector קיים לבחירת חלון זמן

---

## Story 4 — Revenue Forecasting Widget

**Why:** "תחזית חודש זה" — הערך הגדול ביותר מ-Story 2 של ה-roadmap. ניתן לחשב ללא schema חדש.

### 4a — Forecast query

- `src/lib/reports/forecast.ts` — קובץ חדש:
  ```typescript
  export async function getMonthForecast(orgId: string): Promise<{
    projected: number   // כל השיעורים המתוזמנים + subscriptions
    confirmed: number   // תלמידים ללא ביטולים אחרונים
    atRisk: number      // תלמידים עם 2+ ביטולים ב-30 יום
  }>
  ```
  - שאילתה: `lessons` עם `status = 'scheduled'` בחודש נוכחי → price per lesson
  - מוסיף subscription billing (`student_subscriptions` + price)
  - "at risk": תלמיד עם ≥2 `cancellation_events` ב-30 ימים אחרונים

### 4b — Forecast card on dashboard

- `src/components/dashboard/ForecastCard.tsx` — קובץ חדש: card עם 3 שורות:
  - "תחזית חודש זה: ₪X,XXX"
  - "מאושרים: ₪X,XXX | בסיכון: ₪XXX"
  - Badge "בסיכון" אדום אם `atRisk > 0`
- `src/app/(dashboard)/dashboard/page.tsx` — הוסף `<ForecastCard>` לצד ה-KPI grid

---

## Story 5 — Student LTV + Production Hardening

### 5a — Student LTV on profile

**שינויים:**
- `src/lib/students/ltv.ts` — קובץ חדש: שאילתה אחת: `SUM(amount) FROM charges WHERE student_id = X AND status = 'paid'`
- `src/app/(dashboard)/students/[id]/page.tsx` — בטאב Overview, הוסף KPI card "ערך לכל החיים (LTV)"

### 5b — Update `release-checklist.md`

- עדכן Phase 1.1 — הוסף env vars מ-Sprint 25-27 (`RESEND_*`, `AI_CONFIG_ENCRYPTION_KEY`)
- עדכן Phase 2 — E2E scenarios חדשים:

| # | Scenario |
|---|---|
| 8 | **Parent portal cancel** — הורה מבטל שיעור מהפורטל → חיוב מחושב → אישור ב-WhatsApp |
| 9 | **PDF invoice download** — אישור חיוב חודשי → PDF נוצר → כפתור הורדה פעיל ב-billing list |
| 10 | **Quota exceeded** — ניסיון ייבוא 150 תלמידים בחשבון basic (100 מגבלה) → error boundary |
| 11 | **Accounting CSV** — export מדוח הכנסות → קובץ CSV תקין עם כל העמודות |
| 12 | **WhatsApp homework grading** — מורה מדרג שיעורי בית → תלמיד מקבל הודעת WhatsApp |

- עדכן Phase 5 — הוסף smoke tests לפורטל + billing

### 5c — Update `sprint-roadmap.md`

- Sprint 27 → ✅ Done (עם הערה: gaps נסגרו ב-Sprint 28)
- Sprint 28 → Current
- הוסף שורה לטבלת Summary

---

## Schema Migration

**אין מיגרציה חדשה ב-Sprint 28** — כל הנתונים קיימים ב-DB. Story 2-4 הן שאילתות read-only על טבלאות קיימות.

---

## Files to Create

| File | Story |
|------|-------|
| `src/lib/reports/teacherPerformance.ts` | 3a |
| `src/lib/reports/forecast.ts` | 4a |
| `src/components/dashboard/ForecastCard.tsx` | 4b |
| `src/components/dashboard/MiniRevenueChart.tsx` | 2b |
| `src/lib/students/ltv.ts` | 5a |

## Files to Modify

| File | Story |
|------|-------|
| `src/app/(dashboard)/billing/page.tsx` | 1a |
| `src/app/(dashboard)/settings/receipts/ReceiptSettingsForm.tsx` | 1b |
| `src/app/api/import/execute/route.ts` | 1c |
| `src/components/onboarding/steps/ImportStudentsStep.tsx` | 1c |
| `.env.local.example` | 1d |
| `src/lib/dashboard/kpis.ts` | 2a |
| `src/components/dashboard/KpiCard.tsx` | 2a |
| `src/app/(dashboard)/dashboard/page.tsx` | 2b, 4b |
| `src/lib/reports/revenue.ts` | 2b |
| `src/app/(dashboard)/reports/teachers/page.tsx` | 3b |
| `src/app/(dashboard)/students/[id]/page.tsx` | 5a |
| `docs/release-checklist.md` | 5b |
| `docs/sprint-roadmap.md` | 5c |
| `messages/he.json` + `messages/en.json` | 2a, 2b, 3b, 4b |

---

## Acceptance Criteria

- [ ] Billing list מציג כפתור הורדה בשורה אם `invoice_number` קיים; badge "זיכוי" אם `credit_note_number` קיים
- [ ] הגדרות קבלות כוללות selector לסוג מסמך (קבלה / חשבונית מס), נשמר ל-DB
- [ ] ייבוא תלמידים (API + onboarding) זורק `QuotaExceededError` כשחורגים ממגבלת ה-plan
- [ ] `.env.local.example` כולל את כל המשתנים הנדרשים בפרודקשן
- [ ] KPI cards בדשבורד מציגות Δ% vs. חודש קודם (ירוק/אדום)
- [ ] Sparkline של 12 חודשי הכנסות מוצג בדשבורד
- [ ] 3 KPIs חדשים: ממוצע הכנסה/תלמיד, ניצול מורה, המרת לידים
- [ ] Teacher performance report מציג טבלה השוואתית + bar chart ל-3 חודשים
- [ ] Forecast card בדשבורד מציג תחזית/מאושר/בסיכון לחודש הנוכחי
- [ ] פרופיל תלמיד (Overview) מציג LTV מאז תאריך יצירה
- [ ] `release-checklist.md` מעודכן עם 5 E2E scenarios חדשים + כל env vars
- [ ] `sprint-roadmap.md` מעודכן (Sprint 27 ✅, Sprint 28 Current)
- [ ] `npm run build` עובר; `npm test` עובר 100%
- [ ] כל UI חדש תומך ב-i18n (עברית + אנגלית)

---

## Out of Scope

- Student cohort retention analysis (complex query, post-launch v1.1)
- KPI card drill-down pages (post-launch)
- Real-time WebSocket לפורטל הודעות (post-launch)
- Avg lesson rating מ-parent feedback (אין נתונים עדיין)
- Partial credit notes (ביטול חלקי — Sprint 27 decision: לא ב-scope)
- Sumit SaaS E2E staging validation (manual checklist — מתועד ב-release-checklist כ-gate ידני)
