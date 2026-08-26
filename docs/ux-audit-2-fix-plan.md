# תכנית ביצוע — תיקוני UX Audit #2 (Self-Service Readiness)

*נוצר: 2026-08-26 · מקור: דוח האודיט https://claude.ai/code/artifact/1e3406c5-c9df-4d26-a70e-04a06b10e7dd*
*מיועד לריצה אוטונומית של agent. כל שלב = commit אחד. אין נקודות עצירה — אם משימה נתקעת, דלג, סמן skipped עם סיבה בדוח הסיום, והמשך.*

---

## הקשר

האודיט נעשה על פרודקשן, בפרסונה של בעלת עסק שנרשמה לבד (בלי שיחת אונבורדינג), על טננט **בלי WhatsApp מחובר ובלי מפתח AI** — המצב של כל לקוח חדש ביום הראשון. Verdict: **Fail**. שני ממצאים קריטיים:

- **C1** — למוצר אין מושג של "מוגדר / לא מוגדר". שום מסך לא אומר לבעלת העסק שהיא לא live.
- **C2** — עוזר ה-AI מדווח "פועל" בזמן שמעולם לא ענה (Usage: 0 requests), מדליף שגיאה פנימית עם UUID של הארגון, ומכיל trapdoor במתג.

כל הממצאים אומתו בדפדפן אמיתי מול פרודקשן, וכל המיקומים בקוד שלמטה אומתו מול ה-source הנוכחי.

---

## שלב 0 — הכנה (לא commit)

1. קרא `docs/sprint-roadmap.md` ו-`CLAUDE.md` (חובה לפי AGENTS.md).
2. `git status` — אם הקבצים הבאים dirty (WIP קודם), שמור אותם בצד — **הוחלט על stash**:
   ```
   git stash push -m "pre-ux-fixes-wip" -- messages/en.json messages/he.json "src/app/(dashboard)/lessons/new-series/actions.ts" "src/app/(dashboard)/lessons/new-series/page.tsx" src/components/dashboard/lessons/NewSeriesForm.tsx
   ```
   ציין בדוח הסיום שיש stash לשחזור (`git stash pop`).
3. צור branch: `git checkout -b fix/ux-audit-2-self-service`.
4. ודא בסיס ירוק: `npx tsc --noEmit && npm run lint && npm test`. אם הבסיס אדום — עצור ודווח.

### כללי עבודה מחייבים (לכל השלבים)

- **כל מחרוזת UI חדשה** נכנסת גם ל-`messages/he.json` וגם ל-`messages/en.json`, באותו commit שבו נוסף המפתח (מפתח חסר מרונדר כטקסט גולמי בפרודקשן).
- **אין `redirect()` בתוך try/catch**. **כל server action מוטציה** קורא `requireMutation(session)` מיד אחרי `getSession()`.
- **אין שינויי סכמה / מיגרציות** בתכנית הזו. **אין לגעת ב-`DEFAULT_TEMPLATES`** (byte-identical Node↔Deno).
- **אין סקריפטים מול ה-DB** — `.env.local` מצביע על **פרודקשן**.
- אחרי כל שלב: `npx tsc --noEmit && npm run lint && npm test` → commit יחיד: `fix(ux): <תיאור> [<מזהי ממצאים>]`.

---

## שלב 1 — נגישות ותיקונים נקודתיים `[H4, H5, L1, M6, M7]`

### 1.1 תווית למתג התזכורות הראשי (axe Critical)
`src/app/(dashboard)/settings/reminders/RemindersForm.tsx` שורות 46-57 — ה-checkbox `name="reminders_enabled"` בלי `<label>` (ה-`<p>` שלידו לא משויך). עטוף באותה תבנית `<label>` שבה עטופים 6 ה-checkboxes של האימייל באותו קובץ.
**זהירות:** התווית הנראית משתמשת במפתח `settings.reminders.lessonReminder` שמשומש גם ב-notification log וגם ב-email toggles — **אל תשנה את הערך שלו**. צור מפתח חדש `settings.reminders.masterLabel`:
- he: `"תזכורות אוטומטיות"` · en: `"Automatic reminders"`

### 1.2 שם נגיש ל-select של שמירת נתונים (axe Critical)
`src/app/(dashboard)/settings/privacy/DataRetentionForm.tsx` שורות 29-45 — ל-`<select name="retention_days">` אין `id`, ל-label אין `htmlFor`. הוסף `id="retention_days"` + `htmlFor="retention_days"`.

### 1.3 קישורי ניווט מכווצים נשארים ב-tab order (18 עצירות בלתי-נראות)
`src/components/dashboard/Sidebar.tsx` — `CollapsibleSection` (שורות 107-152) מכווץ עם `max-h-0 opacity-0`; הקישורים נשארים focusable. React 19:
- על ה-div המתכווץ (שורות 136-140): `inert={!open}`.
- על כפתור הקבוצה: `aria-expanded={open}`.
**אימות:** tab-walk — אחרי "Reports" סגור, ה-Tab הבא נוחת על "Settings", לא על קישור בלתי-נראה.

### 1.4 אזהרת קונסול על מגירת הניווט (hard gate)
`src/components/dashboard/TopBar.tsx` שורות 107-131 — הוסף `SheetDescription` (מיוצא כבר מ-`src/components/ui/sheet.tsx`) בתוך ה-`SheetHeader` הקיים (שהוא `sr-only`), עם מפתח חדש `nav.drawerDescription`:
- he: `"תפריט ניווט ראשי"` · en: `"Main navigation"`
בנוסף: `aria-label="Open navigation"` בשורה 114 הוא literal באנגלית — החלף במפתח מתורגם (`nav.openNavigation`).

### 1.5 שורות ניווט 35px במובייל
`Sidebar.tsx` — `NavLink` (שורות 72-96), padding `py-1.5`/`py-2`. הסיידבר הקבוע מוצג רק מ-`lg` ומעלה, כך שמותר לתקן רספונסיבית: הוסף `max-lg:min-h-11` (44px) לקלאס השורה (ה-flex כבר ממורכז). בדוק שהמגירה (14 שורות) עדיין נכנסת ב-viewport של 812px בלי גלילה מיותרת.

### 1.6 שלוש הפרות axe Serious
- `/settings/receipts` — קישור בתוך פסקה מזוהה בצבע בלבד → הוסף `underline`.
- Badge ענבר (`.bg-amber-50.text-amber-600`) — החלף ל-`text-amber-700` (בדוק את כל המופעים של הצירוף).
- `/students/import` — `h3` מדלג רמה → `h2`; ו-`border-teal-500` (non-text contrast) → `border-teal-600`.

**Commit:** `fix(ux): a11y — labeled controls, inert collapsed nav, 44px touch targets [H4,H5,L1,M6,M7]`

---

## שלב 2 — עמוד התזכורות אומר את האמת `[H1, L2]`

`src/app/(dashboard)/settings/reminders/RemindersForm.tsx` (משתמש כבר ב-`useActionState`):

1. הפוך את המתג הראשי ל-state מבוקר (`useState(defaultEnabled)`).
2. `disabled={!remindersEnabled}` על כל 9 הפקדים התלויים (select שעות, ימים אחרי חשבונית, 6 checkboxes של אימייל). **כפתור Save נשאר פעיל** — כדי שאפשר יהיה לשמור את המתג עצמו.
3. כשהמתג כבוי — שורת אזהרה מעל Save, מפתח `settings.remindersPage.offWarning`:
   - he: `"התזכורות כבויות — ההגדרות נשמרות, אבל שום הודעה לא תישלח."`
   - en: `"Reminders are off — these settings are saved but nothing will be sent."`
4. `[L2]` בזמן `isPending`: כפתור Save מנוטרל + `Loader2` (lucide) מסתובב. השמירה נמדדה 5-8 שניות — כפתור פעיל מזמין דאבל-קליק.
5. הודעת ההצלחה משתמשת היום ב-`tp('dataRetention.saved')` (שורה 131 — reuse חוצה-namespace). צור מפתח ייעודי `settings.remindersPage.saved`.

**Commit:** `fix(ux): reminders form tells the truth when master switch is off [H1,L2]`

---

## שלב 3 — עמוד חיבור WhatsApp `[H2]`

`src/app/(dashboard)/settings/whatsapp/page.tsx`:

1. **העבר את בלוק הדרישות (שורות 98-105) מעל כרטיס ה-connect (שורות 57-63)** — היום הוא מרונדר אחרון, מתחת לכפתור.
2. כותרת הבלוק (`settings.whatsappPage.requirementsTitle`):
   - he: `"לפני שמתחילים — כ־2–3 ימים"` · en: `"Before you start — about 2–3 days"`
3. הפוך את הדרישות לקישורים אמיתיים (`<a target="_blank" rel="noopener noreferrer">` עם underline):
   - req1 (חשבון Meta Business) → `https://business.facebook.com/`
   - req3 (אימות עסקי) → `https://www.facebook.com/business/help/2058515294227817`
4. מתחת ל-req2 (מספר טלפון) הוסף את המשפט הקריטי החסר (`settings.whatsappPage.req2Hint`):
   - he: `"אי אפשר לחבר מספר שכבר פעיל באפליקציית WhatsApp. השתמשו במספר שני, או העבירו את המספר הקיים — ואז הוא יפסיק לעבוד באפליקציה."`
   - en: `"A number that is already active in the WhatsApp app can't be connected. Use a second number, or migrate your existing one — it will then stop working in the app."`
5. שורת עזרה בתחתית הבלוק: he `"לא בטוחים? כתבו לנו"` / en `"Not sure? Write to us"` → `mailto:support@getlessio.com` (השתמש ב-`NEXT_PUBLIC_SUPPORT_EMAIL` אם זמין בקלות).

**Commit:** `fix(ux): whatsapp prerequisites above the CTA, linked, with a duration [H2]`

---

## שלב 4 — רישום מסלולים אחד: hub, breadcrumbs, תוויות `[H3, M1]`

### 4.1 קובץ registry חדש — `src/lib/navigation/registry.ts` (~180 שורות)

מודול **איזומורפי** — בלי `'use client'`, בלי imports של supabase/server-only (הוסף הערת אזהרה בראש הקובץ). אייקוני lucide בטוחים בשני הצדדים (מאומת — settings/page.tsx server משתמש בהם היום).

```ts
import type { LucideIcon } from 'lucide-react'
import type { SaasFeatures } from '@/lib/saas/types'

export type NavRole = 'owner' | 'admin' | 'teacher'
export interface NavEntry {
  href: string
  navKey: string          // מפתח תחת namespace `nav` — הקריאה ל-t() נשארת אצל הצרכן
  cardKey?: string        // מפתח תחת `settings.cards` — רק לערכים שמופיעים ב-hub
  icon: LucideIcon
  roles?: NavRole[]       // חסר = כולם
  saasFeature?: keyof SaasFeatures
  synonyms?: string[]     // לשלב 7 — lowercase, עברית+אנגלית מעורבב
}
export const SETTINGS_NAV: NavEntry[]   // 15: /account/billing + כל 14 עמודי /settings/*
export const REPORTS_NAV: NavEntry[]    // 6 (revenue בלי saasFeature; השאר full_reports — משמר את הסינון הקיים)
export const MAIN_NAV: NavEntry[]       // 12 — ל-breadcrumbs ולחיפוש בלבד, לא מקור הרינדור של הסיידבר
export const SECTION_HUBS = { '/reports': …, '/settings': …, '/teacher': … }
export function filterNav(entries, role, features?): NavEntry[]
export function resolveBreadcrumb(pathname): { sectionKey, sectionHref, pageKey }  // פורט של getBreadcrumbKeys כולל prefix-fallback
```

- roles נגזרים מה-`ownerOnly` הקיים ב-settings/page.tsx (רק holidays ו-locale פתוחים ל-admin).
- מפתחות nav חדשים (לא קיימים היום): `nav.settingsPricing`, `nav.settingsPrivacy`, `nav.settingsCalendar` — he+en, **באותו commit**.

### 4.2 Sidebar צורך את ה-registry
`src/components/dashboard/Sidebar.tsx` — מחק `reportsItems`/`settingsItems` (194-216), `visibleReportItems`/`visibleSettingsItems` (239-252) ו-`hasSaasNav` (154-157); החלף ב-`filterNav(...)` + מיפוי ל-shape הקיים עם `t(navKey as Parameters<typeof t>[0])` (האידיום קיים ב-TopBar:101). **אל תיגע ב-`mainItems`/`teacherItems`** (תוויות תלויות-role כמו `teacherStudents` — לא free). תוצאה: הסיידבר מקבל את pricing / privacy / calendar שחסרים בו היום.

### 4.3 "Settings" ו-"Reports" הופכים לניווטים
`CollapsibleSection` מקבל `href?: string`. שורת הכותרת נהיית `<div>` עם שני אחים (לעולם לא button בתוך Link):
- `<Link href={href} onClick={() => setOpen(true)} className="flex flex-1 …">` — **ה-`setOpen(true)` קריטי**: `open` מאותחל פעם אחת מ-`isAnyActive` וניווט client-side לא עושה remount, אז בלעדיו הקבוצה נשארת סגורה אחרי הניווט.
- `<button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>` עם ה-chevron.
Owner/admin מקבלים `href="/settings"` / `href="/reports"`; קבוצת הדוחות של teacher — בלי href (אין index).

### 4.4 עמוד ה-hub
`src/app/(dashboard)/settings/page.tsx`:
- מחק את `SETTING_CARDS` (27-126); `const cards = filterNav(SETTINGS_NAV, role).filter(e => e.cardKey)`.
- **תקן את באג הכותרת** (שורות 132-135): `subtitle={t('cards.locale.description')}` ← copy-paste. מפתח חדש `settings.subtitle`:
  - he: `"כל ההגדרות של העסק במקום אחד"` · en: `"All your business settings in one place"`
- מחק את בלוק `<CardContent>{t('cardHint')}</CardContent>` (155-157) — filler שחוזר 14 פעמים.

### 4.5 breadcrumbs אמיתיים
`src/components/dashboard/TopBar.tsx` — מחק `ROUTE_KEY_MAP`/`SECTION_KEY_MAP`/`getBreadcrumbKeys` (18-87); השתמש ב-`resolveBreadcrumb`. ה-ancestor ("Settings") הופך מ-`<span>` ל-`<Link href={sectionHref}>` (באודיט נלחץ — מת). ה-registry סוגר אוטומטית את כל המסלולים החסרים: `/messages`, `/account/billing`, `/settings/email`, `/settings/calendar`, `/settings/business-profile`, `/settings/pricing`, `/settings/privacy`, `/reports/teacher-performance`.

### 4.6 שלושה משטחים בשם "Messages" `[M1]`
- סיידבר ראשי `Messages` → he: `"הודעות מהפורטל"` · en: `"Portal messages"` (וזה גם ה-H1 של `/messages`).
- Settings → `Messages` → he: `"תבניות WhatsApp"` · en: `"WhatsApp templates"` — בסיידבר, ב-hub, וב-H1 של העמוד.

### 4.7 בונוס קטן
`src/app/(dashboard)/reports/page.tsx` — הוסף כרטיס `/reports/teacher-performance` ל-`REPORT_CARDS` (קיים בסיידבר, חסר ב-index).

**Commit:** `fix(ux): one nav registry — reachable hubs, real breadcrumbs, honest labels [H3,M1]`

---

## שלב 5 — יושרה של עוזר ה-AI `[C2]`

### 5.1 עצור את דליפת השגיאה
`src/app/(dashboard)/settings/ai-assistant/actions.ts` — `testAiConnectionAction`, שורות 196-200: היום `err.message` הגולמי (כולל `[ai/factory]` + UUID) נכנס ל-`errors.testFailed`. תפוס `AiProviderNotConfiguredError` (מיוצא מ-`src/lib/ai-assistant/providers/factory.ts`) → מפתח חדש `settings.aiAssistant.errors.noKey`:
- he: `"לא מוגדר מפתח API לספק שנבחר. הדביקו מפתח למעלה ושמרו."`
- en: `"No API key is configured for this provider. Paste a key above and save."`
כל שגיאה אחרת → `errors.unknownError` הקיים, **בלי** תוכן ה-Error.

### 5.2 מתג שאומר את האמת + ביטול ה-trapdoor
`src/app/(dashboard)/settings/ai-assistant/AiAssistantForm.tsx`:
- היום: `canToggle = isConfigured || defaultEnabled` + `<form key={String(defaultEnabled)}>` → כיבוי בלי מפתח נועל את המתג לצמיתות.
- חדש: `const disabled = !isConfigured && !defaultEnabled` — **כיבוי מותר תמיד; הדלקה דורשת מפתח.** (מצב "כבוי ולא מוגדר" נשאר מנוטרל — קוהרנטי, כי הבאנר הענבר מסביר למה.)
- כשהמצב `defaultEnabled && !isConfigured` (מודלק בלי מפתח — המצב שנצפה בפרודקשן): אל תציג מתג כחול "בריא"; הוסף שורת סטטוס במצב אזהרה, מפתח `settings.aiAssistant.onButNotAnswering`:
  - he: `"מופעל, אבל לא עונה — חסר מפתח API"` · en: `"On, but not answering — add an API key"`
- **כתוב test** ללוגיקת ה-disabled בשלושת המצבים (configured/on, configured/off, not-configured/on) לפני התיקון, וודא שהוא משחזר את הנעילה הישנה.

### 5.3 אל תבטיח "system key" שלא קיים
`page.tsx` (ai-assistant) — `isConfigured` כבר משקלל `isAiAssistantConfigured()` (= `Boolean(process.env.OPENAI_API_KEY)`, `src/lib/ai-assistant/index.ts:26`), אבל הוא מועבר רק ל-AiAssistantForm. העבר prop חדש ל-`AiProviderForm`: `hasPlatformKey={Boolean(process.env.OPENAI_API_KEY)}`, ובשורות 111-116 של AiProviderForm הצג את `openaiKeyOptional` ("Leave empty to use the system key") **רק** כש-`selectedProvider === 'openai' && hasPlatformKey`; אחרת `apiKeyRequired`.

### 5.4 הערת שקיפות ל-Test connection
ה-action בודק את **הקונפיגורציה השמורה**, לא את מה שנבחר בטופס (הוא מתעלם מה-formData). הוסף טקסט עזר קטן מתחת לכפתור, מפתח `settings.aiAssistant.testHint`:
- he: `"בודק את ההגדרות השמורות — שמרו לפני הבדיקה."` · en: `"Tests the saved configuration — save before testing."`

**Commit:** `fix(ux): AI assistant reports its real state, no internal errors, no toggle trapdoor [C2]`

---

## שלב 6 — המוצר יודע אם הוא מוגדר `[C1]`

### 6.1 helper — `src/lib/organizations/readiness.ts` (+ `readiness.test.ts`)
(לצד `providerStatus.ts` הקיים — האנלוג הקרוב ביותר.)

```ts
export type OrgReadinessRow = {
  whatsapp_phone_number_id: string | null
  ai_provider: string | null
  ai_config_encrypted: string | null
  payment_config_encrypted: string | null
}
export type OrgReadiness = { hasWhatsApp: boolean; hasAi: boolean; hasPayment: boolean; isReady: boolean }
export function computeOrgReadiness(row: OrgReadinessRow | null, opts: { platformOpenAiKey: boolean }): OrgReadiness
export async function getOrgReadiness(orgId: string): Promise<OrgReadiness>   // select אחד, maybeSingle, לא זורק
```

- `hasAi` משכפל את הכלל של `isAiConfiguredForOrg` (`factory.ts:104-120`) — org key **או** platform key כש-provider=openai. הוסף הערות cross-link בשני הקבצים (שאילתה אחת של 4 עמודות במקום שתיים).
- הקובץ קורא `process.env.OPENAI_API_KEY` → **server-only בפועל. לעולם לא לייבא אותו מה-registry או מקוד client.**
- טסטים על הפונקציה הטהורה בלבד, בסגנון `src/lib/dashboard/attention.test.ts` (בלי mocks): null row, כל דגל בנפרד, openai platform fallback, ספק לא-openai בלי org key → false, isReady רק כששלושתם.

### 6.2 SetupStrip בדשבורד
- `src/components/dashboard/sections.tsx` — `SetupSection({ orgId })` (server): קורא `getOrgReadiness`, מחזיר null כש-`isReady`, אחרת מרנדר את הרכיב הקליינטי עם רשימת החוסרים.
- `src/components/dashboard/SetupStrip.tsx` (`'use client'`): props `{ orgId, missing: ('whatsapp'|'ai'|'payment')[] }`. שורה לכל חוסר עם קישור: `/settings/whatsapp`, `/settings/ai-assistant`, `/settings/payment`. כפתור ✕ → localStorage key `` `lessio.setup-strip.${orgId}` `` (org-scoped — superadmin ב-support mode מדלג בין ארגונים) עם `Date.now()`; מוצג רק אם אין timestamp או שעברו 7 ימים; **כל גישה ל-localStorage ב-try/catch**; מתחיל hidden ומופיע אחרי mount (מונע hydration mismatch) עם `animate-in fade-in-0`.
- `src/app/(dashboard)/dashboard/page.tsx` — בין `<PageHeader>` (שורה ~77) ל-TodaySection:
  ```tsx
  {role === 'owner' && (
    <Suspense fallback={null}><SetupSection orgId={orgId} /></Suspense>
  )}
  ```
  **לא להוסיף את השאילתה ל-`Promise.all` של העמוד** — Suspense נפרד עם `fallback={null}` שומר על ה-LCP (2.47s היום).
- i18n — namespace `dashboard.setup`:
  - `title`: he `"עוד כמה צעדים להשלמת ההגדרה של Lessio"` · en `"Finish setting up Lessio"`
  - `items.whatsapp`: he `"עוד לא מחובר מספר WhatsApp — ההודעות האוטומטיות לא נשלחות."` · en `"No WhatsApp number connected — automatic messages are not being sent."`
  - `items.ai`: he `"עוזר ה-AI לא מוגדר — הודעות מהורים לא נענות אוטומטית."` · en `"The AI assistant isn't configured — parent messages aren't answered automatically."`
  - `items.payment`: he `"לא הוגדר ספק תשלומים — אי אפשר לשלוח קישורי תשלום."` · en `"No payment provider configured — payment links can't be sent."`
  - `dismiss`: he `"סגירה"` · en `"Dismiss"`

**Commit:** `feat(dashboard): setup strip — the product finally knows whether it is live [C1]`

---

## שלב 7 — חיפוש שמגיע להגדרות `[M5]` *(תלוי בשלב 4)*

- **synonyms חיים ב-registry** (`NavEntry.synonyms`) — רשימה שטוחה lowercase שמערבבת עברית ואנגלית (עברית בלי case; הערבוב מכסה הקלדה באנגלית ב-UI עברי ולהפך, כי התאמת ה-title רואה רק את שפת ה-UI הפעילה). חובה לכסות:
  - `/settings/reminders` ← `['reminder','reminders','תזכורת','תזכורות','late payment','debt','חוב','גביה']`
  - `/settings/cancellation-policy` ← `['cancellation','ביטול','ביטולים','charge','חיוב']`
  - `/settings/whatsapp` ← `['whatsapp','bot','בוט','וואטסאפ','connect','חיבור']`
  - `/settings/payment` ← `['payment','תשלום','תשלומים','סליקה','provider','ספק']`
  - וכן synonyms לשם-בשפה-השנייה של כל שאר הערכים.
- ב-registry: `export const SEARCHABLE_PAGES = [...MAIN_NAV, ...SETTINGS_NAV, ...REPORTS_NAV]` + `matchPages(query, entries, getTitle, limit=5)` — פונקציה טהורה (getTitle מוזרק → unit-testable בלי i18n): substring case-insensitive על title מתורגם + synonyms, מינימום 2 תווים.
- `src/components/dashboard/GlobalSearch.tsx`:
  - prop חדש `saasFeatures?: SaasFeatures`; `const tNav = useTranslations('nav')`.
  - `pageHits` מחושב ב-`useMemo` על ה-**query הגולמי** (לא ה-debounced) → תוצאה מיידית, לא נוגע ב-fetch.
  - הקבוצה מרונדרת **אחרונה** (אחרי charges), עד 5 שורות: אייקון (14, muted) + כותרת מתורגמת, אותו סטיילינג `role="option"`.
  - תנאי רינדור בלתי-תלוי ב-`data`/`loading`/`error` — מוצג גם בזמן fetch וגם כשה-API נכשל. `noResults` מקבל `&& pageHits.length === 0`.
- שרשור props: `layout.tsx` (שני call sites — רגיל + support) → `TopBar` → `GlobalSearch`. `undefined` = הצג הכל (תואם לסמנטיקת הסיידבר).
- i18n: `nav.globalSearch.sections.pages`: he `"עמודים והגדרות"` · en `"Pages & settings"`; עדכן placeholder (en.json:277): he `"חיפוש תלמידים, הורים, שיעורים, הגדרות…"` · en `"Search students, parents, lessons, settings…"`.

**Commit:** `feat(ux): global search reaches pages and settings [M5]`

---

## שלב 8 — ברירת מחדל של שפת תבניות `[M3]`

`src/app/(dashboard)/settings/message-templates/page.tsx` שורות 103-104 — `parseAppLocale(lang)` נופל תמיד ל-he. **אין select של organizations בגוף העמוד** (זה שבתוך `loadStatusesWithCatchUp` מותנה ולא אמין) — הוסף שאילתה קטנה: `organizations.select('default_locale')`, ואז:
```ts
const locale = parseAppLocale(lang ?? org.default_locale)
```
וסדר את `LANG_TABS` כך ששפת הארגון ראשונה. לא לגעת בתוכן התבניות.

**Commit:** `fix(i18n): template editor opens in the org's language [M3]`

---

## שלב 9 — קיבוץ סעיפי הכסף בתפריט `[M8]`

`Sidebar.tsx` — ארבעה סעיפי כסף שטוחים היום ב-`mainItems`: Charges (`/charges`), Monthly Billing (`/billing`), Debtors (`/billing/debts`), Subscriptions (`/subscriptions`). קבץ אותם תחת `CollapsibleSection` חדש בתוך בלוק MANAGEMENT, בין Lessons ל-Leads:
- label — מפתח `nav.sections.money`: he `"כספים"` · en `"Money"`; בלי `href` (אין hub לכסף); `defaultOpen` כשאחד מהם active (ההתנהגות הקיימת של `isAnyActive`).
- ארבעת הפריטים יוצאים מ-`mainItems` לתוך מערך `moneyItems` (נשאר inline בסיידבר, לצד mainItems — לא ב-registry, כי mainItems לא הועברו).
- ודא שסינון ה-saasFeatures הקיים על הפריטים האלה נשמר כמו שהוא.
- עדכן את `ROUTE_NAV_KEYS`/breadcrumbs אם צריך (המסלולים כבר ממופים — רק ודא שאין רגרסיה).

**Commit:** `feat(nav): one Money group instead of four flat billing entries [M8]`

---

## שלב 10 — ארגונומיה של עמוד התבניות `[M2]`

`/settings/message-templates` מציג היום 20 טפסים פתוחים בטור אחד (~24,000px). מצא את הקומפוננטה הפר-תבנית (עקוב אחרי ה-import ב-`page.tsx` סביב שורה 130) ובצע:

1. **קיפול**: כל תבנית הופכת לשורה מכווצת — שם + סטטוס chip + השורה הראשונה של הטקסט; קליק מרחיב את הטופס המלא (accordion — אחת פתוחה בכל רגע זה בונוס, לא חובה). השתמש ב-primitives קיימים (`Collapsible` מ-shadcn אם קיים ב-`src/components/ui/`, אחרת `<details>` מעוצב).
2. **Variable chips**: מתחת ל-textarea, כפתורי chip לכל משתנה זמין (`{{student_name}}` וכו' — הרשימה קיימת פר-type ב-`src/lib/whatsapp/templates.ts`); קליק מוסיף את המשתנה במיקום הסמן (client component, `selectionStart`).
3. **הסבר סטטוס Meta**: מתחת ל-chip של APPROVED/PENDING הוסף שורת הסבר, מפתחות `settings.messageTemplates.statusHint.{approved,pending,rejected}`:
   - approved — he: `"מאושר על ידי WhatsApp — נשלח גם כשההורה לא כתב לכם ב-24 השעות האחרונות."` · en: `"Approved by WhatsApp — can be sent even when the parent hasn't messaged you in the last 24 hours."`
   - pending — he: `"ממתין לאישור WhatsApp — עד אז ההודעה נשלחת רק בתוך חלון של 24 שעות משיחת ההורה."` · en: `"Waiting for WhatsApp approval — until then this message only sends within 24 hours of the parent's last message."`
   - rejected — he: `"נדחה על ידי WhatsApp — פנו לתמיכה."` · en: `"Rejected by WhatsApp — contact support."`
4. שם התבנית הטכני (`lessio_<type>_<lang>_v2`) עובר לטקסט קטן/tooltip — לא כותרת.
5. **אסור** לשנות את מנגנון השמירה/הרישום עצמו או את `DEFAULT_TEMPLATES`.

**Commit:** `feat(ux): template editor — collapsed rows, variable chips, plain-language Meta status [M2]`

---

## שלב 11 — "שלח בדיקה למספר שלי" `[M4]`

בעמוד התבניות, ליד כל Preview:

1. **Server action חדש** `sendTestTemplateAction` ב-`settings/message-templates/actions.ts`:
   - `getSession()` → `requireMutation(session)` → role owner בלבד.
   - Zod: `{ templateType, locale, phone }` — phone בפורמט בינלאומי (`/^\+\d{9,15}$/`).
   - Guard: אם `organizations.whatsapp_phone_number_id` ריק → שגיאה מתורגמת "חברו מספר WhatsApp קודם".
   - רינדור עם ערכי הדוגמה הקיימים של ה-Preview (ב-`src/lib/whatsapp/templates.ts`), שליחה דרך **`sendSmartMessage`** (מטפל בחלון 24h → template fallback; לעולם לא helpers ישנים).
   - הגבלה: עד 5 שליחות לשעה לארגון (ספירה בזיכרון פשוטה או על `notification_log` אם קיים שם type מתאים — אם מסובך, ויתור מסומן בהערה).
2. **UI**: input יחיד בראש העמוד — "מספר לבדיקה" (נשמר ב-localStorage, try/catch) + כפתור "שלח בדיקה" בכל שורת תבנית מורחבת. i18n: `settings.messageTemplates.test.{phoneLabel,send,sent,connectFirst}` he+en.
3. **טסט יחידה** על הולידציה של ה-action (mock ל-sendSmartMessage — pattern קיים ב-`actions.test.ts` של whatsapp settings).
4. **אימות אוטומטי: לא לשלוח הודעה אמיתית.** ה-env המקומי מחובר לפרודקשן — האימות בריצה הוא type-check + unit test בלבד; שליחה חיה נשארת לבדיקה ידנית של הדר.

**Commit:** `feat(whatsapp): send a test message to your own number [M4]`

---

## שלב 12 — שלב WhatsApp באשף האונבורדינג `[C1b]`

**Explore קודם**: קרא את `src/app/(onboarding)/onboarding/` ואת קומפוננטות האשף (Welcome → Teachers → Settings → Import Students → Import Lessons → Complete).

- **גישה מועדפת**: הוסף שלב "WhatsApp" בין Import Lessons ל-Complete: מסביר מה הבוט נותן (משפט אחד), מציג את בלוק הדרישות משלב 3 (reuse), כפתור ראשי → `/settings/whatsapp` (לא Embedded Signup בתוך האשף — ה-popup של Meta לא שייך לזרימת wizard), וכפתור **"דלג לעכשיו"** בולט באותו משקל ויזואלי.
- **גישת fallback** (אם מבנה האשף עושה את זה מסובך — למשל state machine קשיח): כרטיס "הצעד הבא: חיבור WhatsApp" במסך ה-Complete עם אותו קישור.
- אסור לחסום את השלמת האונבורדינג על חיבור WhatsApp — דילוג תמיד אפשרי, `onboarding_completed` לא תלוי בזה.
- i18n: `onboarding.whatsapp.{title,description,cta,skip}` he+en.

**Commit:** `feat(onboarding): whatsapp step — the product's core feature enters the wizard [C1b]`

---

## שלב 13 — אימות סופי + PR

1. `npx tsc --noEmit && npm run lint && npm test` — הכל ירוק.
2. `npm run dev` + בצע 30-second dogfood drill על כל עמוד שהשתנה:
   `/dashboard` (אין רגרסיה; ה-strip לא אמור להופיע אם הארגון המקומי מחובר), `/settings` (כותרת חדשה, 14 כרטיסים בלי footer), `/settings/reminders` (כבה/הדלק מתג → העמעום והאזהרה), `/settings/whatsapp` (דרישות מעל הכפתור, קישורים נפתחים), `/settings/ai-assistant` (Test connection → הודעה מתורגמת בלי UUID), `/settings/message-templates` (שורות מכווצות, chips, `?lang` ברירת מחדל), חיפוש "תזכורת" ו-"reminder" בהדר → קבוצת עמודים, קליק על "Settings" בסיידבר → `/settings`, breadcrumb "Settings" לחיץ, tab-walk (אין עצירות בלתי-נראות), תפריט "כספים" נפתח ונסגר, ואשף האונבורדינג (טננט חדש או `onboarding_completed=false` — **לא לשנות דאטה בפרוד; בדיקה ויזואלית של הקומפוננטה מספיקה**).
   בכל עמוד: קונסול נקי, אין 4xx/5xx.
3. פתח PR עם טבלת מיפוי ממצא→commit + קישור לדוח: https://claude.ai/code/artifact/1e3406c5-c9df-4d26-a70e-04a06b10e7dd
4. דוח סיום: מה בוצע, מה דולג ולמה, תזכורת ל-`git stash pop` (שלב 0), ומה נשאר לבדיקה ידנית (שליחת test message אמיתית).

---

## ידוע ומכוון — לא "לתקן"

- `/settings/pricing` מחזיר 404 בפרודקשן — הקוד קיים ב-source; ייפתר בדיפלוי. ה-registry כולל אותו.
- אזהרות קונסול מ-facebook.com בתוך popup של Meta — third-party.
- ה-trapdoor ב-C2 אובחן בקוד ולא הופעל בדפדפן — לכן הטסט בשלב 5.2 נכתב לפני התיקון.
- `mainItems`/`teacherItems` לא עוברים ל-registry (תוויות תלויות-role) — הערת cross-reference בלבד.
- הכפילות בין `computeOrgReadiness` ל-`isAiConfiguredForOrg` מכוונת (שאילתה אחת במקום שתיים) ומסומנת בהערות cross-link.
