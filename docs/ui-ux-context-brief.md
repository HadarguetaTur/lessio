# LESSIO — UI/UX Context Brief

מסמך זה מרכז את הקונטקסט המוצרי של LESSIO עבור צוות UI/UX על בסיס ה-source of truth העדכני בקוד ובמסמכי המוצר. מטרתו היא לתת תמונה אחת ברורה של מה המוצר עושה, למי הוא מיועד, באילו משטחים הוא פועל, ומהן הזרימות המרכזיות שצריך לעצב, ללטש או לאחד.

## 1. Executive Summary

LESSIO הוא מוצר SaaS רב-ארגוני לניהול עסקי הוראה, מורים פרטיים ומרכזי למידה. המוצר נבנה כדי לפתור כאוס תפעולי סביב תיאום שיעורים, ביטולים, גבייה, תזכורות ותקשורת עם הורים.

העיקרון המוצרי המרכזי הוא חלוקה בין שני ערוצים:

- WhatsApp הוא ערוץ התקשורת הראשי מול הורים.
- ה-web משלים אותו בפעולות מובנות: dashboard לצוות, אזור מורה, פורטל הורים, ו-booking flow מבוסס token.

מנקודת מבט UX, זה לא "מסך אחד" אלא מערכת עם כמה משטחים שונים, שכל אחד מהם משרת משתמש אחר, רמת אמון אחרת, והקשר פעולה אחר.

## 2. מה המוצר מנסה לפתור

### הבעיות העסקיות

- ביטולים לא מנוהלים שגורמים לאובדן הכנסה.
- תיאום שיעורים ידני שיוצר עומס וטעויות.
- גבייה ידנית ומעקב חלקי אחרי חובות ותשלומים.
- עומס תפעולי מול הורים ב-WhatsApp.
- חוסר שקיפות לבעלי העסק לגבי פעילות, חובות וביצועים.

### מטרות המוצר

- לרכז את התפעול השוטף של עסק הוראה במערכת אחת.
- להפוך את WhatsApp לערוץ שירות ותפעול, לא רק ערוץ הודעות.
- לתת self-service להורים בלי להפוך אותם למשתמשי dashboard.
- לאפשר שליטה והרשאות ברורות בין owner, admin, teacher ו-superadmin.
- לתמוך בתהליך עבודה מקצה לקצה: lead, parent, student, booking, lesson, charge, payment, report.

## 3. מי המשתמשים

### משתמשים פנימיים

| סוג משתמש | המטרה שלו | גישה |
|---|---|---|
| `owner` | ניהול מלא של הארגון, הגדרות, דוחות, תשלומים, WhatsApp | dashboard מלא |
| `admin` | תפעול שוטף: תלמידים, הורים, לידים, שיעורים, שיעורי בית, דוחות | dashboard תפעולי, בלי חלק מהגדרות הארגון |
| `teacher` | ניהול הלו"ז האישי, זמינות, עדכון תוצאות שיעור, שיעורי בית | אזור מורה בלבד |
| `superadmin` | ניהול פלטפורמה, ארגונים, בילינג, support mode | shell נפרד של admin |

### משתמשים חיצוניים

| סוג משתמש | המטרה שלו | גישה |
|---|---|---|
| `parent` | לקבוע שיעור, לצפות בשיעורים, לראות יתרה ולשלם, לקבל שירות עצמי | WhatsApp + portal + booking link |
| `student` | לקבל שיעורי בית ותזכורות, לעתים לסמן שהושלם | בעיקר דרך WhatsApp, לא משתמש dashboard |
| `lead` | פנייה נכנסת שעדיין לא משויכת להורה קיים | נוצר אוטומטית מתוך WhatsApp ונכנס לטיפול dashboard |

## 4. פלטפורמות, משטחים וערוצים

### 4.1 Staff Dashboard

זהו המשטח הראשי של `owner` ו-`admin`. הוא כולל:

- לוח בקרה
- תלמידים
- הורים
- מורים
- שיעורים
- חיובים
- לידים
- שיעורי בית
- דוחות
- הגדרות

המטרה של המשטח הזה היא ניהול תפעולי מלא של הארגון, כולל people management, schedule, billing, follow-up ו-configuration.

### 4.2 Teacher Workspace

זהו אזור מצומצם יותר עבור `teacher`, עם גישה רק ל:

- השיעורים שלי
- מנוי ליומן
- שיעור חדש
- הזמינות שלי
- חריגים ביומן
- שיעורי בית

מבחינת UX, זהו workspace ממוקד-ביצוע, לא מערכת ניהול מלאה.

### 4.3 Parent Portal

זהו משטח web נפרד עבור הורים, mobile-first, ללא Supabase session. הגישה היא דרך OTP טלפוני שנשלח ב-WhatsApp, ולא דרך login רגיל.

בפורטל יש כרגע שלושה מוקדים עיקריים:

- Home: שיעורים קרובים + יתרה פתוחה
- Book: קביעת שיעור
- Payments: היסטוריית חיובים/תשלום/קישורי קבלה

מבחינת UI, זה נראה ומתנהג כמו מוצר mobile-first נפרד מה-dashboard.

### 4.4 Booking Link Flow

זהו flow קצר וממוקד שמתחיל מ-WhatsApp ונפתח דרך `/book/[token]`.

המאפיינים שלו:

- token מבוסס JWT עם תוקף מוגבל
- ללא dashboard auth
- הורה בוחר מורה, תאריך, משך ושעה
- המטרה היחידה היא לקבוע שיעור ולהשלים booking

זה לא פורטל, אלא משטח transactional ממוקד.

### 4.5 Super Admin Surface

זהו אזור נפרד למפעיל הפלטפורמה:

- dashboard פלטפורמי
- רשימת ארגונים
- יצירת ארגון חדש
- billing readiness / platform billing
- support mode לתצוגה read-only בתוך ארגון

מבחינת UX, זהו מוצר אדמיניסטרטיבי נפרד מהמערכת היומיומית של לקוח הקצה.

### 4.6 WhatsApp

WhatsApp הוא לא רק integration, אלא channel product:

- נקודת כניסה להזמנות
- שליחת OTP לפורטל
- תזכורות
- בקשות תשלום
- שאלות self-service
- fallback עם AI assistant
- capture של leads

UI/UX צריך להתייחס אליו כחלק מהשירות, גם אם הממשק עצמו אינו בתוך ה-web app.

## 5. מפת המוצר לפי אזורי יכולת

### Scheduling and Lessons

- זמינות שבועית למורים
- חריגים ביומן
- חסימות של חגים וחופשות
- קביעת שיעור בודד
- סדרות שיעורים חוזרות
- conflict detection
- slot locking
- lesson status: scheduled, completed, cancelled, no_show

### People and CRM

- ניהול תלמידים
- ניהול הורים
- ניהול מורים
- קשרי parent-student
- primary billing parent
- ניהול לידים והמרה ל-parent + student

### Billing, Payments and Receipts

- חיובים אוטומטיים ומנואליים
- חיובי ביטול לפי policy
- מעקב אחרי pending / invoiced / paid
- קישורי תשלום
- payment providers
- קבלות / חשבוניות
- יתרה פתוחה בפורטל

### WhatsApp Automation

- booking link dispatch
- parent cancellation flow
- lead capture
- תזכורות שיעור
- תזכורות תשלום
- custom message templates
- self-service intents
- AI fallback

### Homework

- תבניות שיעורי בית
- שיוך לתלמידים
- שליחה ב-WhatsApp
- סטטוסים של assignment

### Analytics and Reports

- דוח הכנסות
- דוח שיעורים
- דוח חובות
- דוח מורים
- דוח תלמידים
- KPI dashboard
- CSV export

### Org and Platform Configuration

- חיבור WhatsApp
- תבניות הודעה
- ספק תשלומים
- ספק קבלות
- מדיניות ביטולים
- חגים וחופשות
- תזכורות
- עוזר AI
- superadmin org management

## 6. Journeys מרכזיים לצוות UI/UX

### 6.1 Owner / Admin Daily Operations

1. התחברות דרך `/login`
2. כניסה ל-dashboard
3. עבודה שוטפת על תלמידים, הורים, מורים ושיעורים
4. מעקב אחרי חיובים, לידים, שיעורי בית ודוחות
5. כניסה להגדרות לצורך חיבורי מערכת ואוטומציות

### 6.2 Lead to Customer

1. הודעה נכנסת ב-WhatsApp ממספר לא מוכר
2. יצירת `lead`
3. טיפול בליד מתוך `/leads`
4. המרה ל-parent + student
5. המשך עבודה רגילה מתוך people management

### 6.3 Parent Booking Journey

1. הורה יוזם ב-WhatsApp
2. המערכת מזהה parent קיים או יוצרת lead
3. עבור parent קיים נוצר booking token
4. ההורה פותח link
5. בוחר מורה, תאריך, משך ושעה
6. המערכת נועלת slot זמני
7. אישור booking
8. נשלחת הודעת אישור

### 6.4 Parent Portal Journey

1. הורה נכנס ל-`/portal/[orgId]`
2. מזין מספר טלפון
3. מקבל OTP ב-WhatsApp
4. נכנס לפורטל
5. רואה שיעורים קרובים ויתרה
6. יכול לקבוע שיעור ולשלם

### 6.5 Teacher Journey

1. מורה מתחבר
2. המערכת מפנה אותו ל-`/teacher/schedule`
3. הוא רואה רק את סביבת העבודה שלו
4. יכול לעדכן תוצאת שיעור, לנהל זמינות, חריגים ושיעורי בית

### 6.6 Superadmin Journey

1. superadmin נכנס ל-shell נפרד
2. רואה KPIs פלטפורמיים וארגונים
3. בודק billing readiness
4. מפעיל support mode במקרה הצורך
5. צופה בארגון כ-owner אך ללא הרשאות עריכה

## 7. מה חשוב במיוחד ל-UI/UX להבין

### 7.1 זה מוצר multi-surface

המערכת איננה dashboard יחיד. יש בה לפחות ארבעה משטחים עיקריים שדורשים שפה עיצובית עקבית אבל הקשר שימוש שונה:

- staff dashboard
- teacher workspace
- parent portal
- booking link flow

### 7.2 זה מוצר Hebrew-first ו-RTL

ה-root layout מוגדר עם `lang="he"` ו-`dir="rtl"`. נכון לעכשיו, Hebrew הוא ה-baseline של המוצר, לא רק לוקליזציה אופציונלית.

### 7.3 WhatsApp הוא חלק ממבנה המוצר

חלק מהפעולות מתחילות או מסתיימות מחוץ לאפליקציה. לכן UX צריך להתחשב ב:

- מסרים שמובילים ל-web
- חזרה מ-web ל-WhatsApp
- אמון ברור סביב OTP, payment links ו-token links
- state קצר-חיים כמו קישור שפג תוקף

### 7.4 ההרשאות משנות את הניווט ואת התוכן

המערכת role-based לא רק ברמת backend אלא גם ברמת surface:

- `owner` רואה את כל אזורי ההגדרות
- `admin` רואה אזור תפעולי רחב אך לא את כל ההגדרות
- `teacher` מוגבל לנתיבים מסוימים בלבד
- `superadmin` נמצא ב-shell אחר

מבחינת UX, אי אפשר לעצב navigation אחד לכל המשתמשים.

### 7.5 ה-parent אינו משתמש dashboard

להורה אין כניסה רגילה ל-dashboard. הוא משתמש חיצוני עם גישה מבוססת phone + WhatsApp + OTP + tokenized flows. לכן חוויית ההורה צריכה להיות פשוטה, אמינה ומעט-friction ככל האפשר.

## 8. Current Scope מול Planned Scope

### Baseline קיים עכשיו

- dashboard תפעולי לארגון
- teacher area
- parent portal
- booking flow
- billing, payments, receipts
- homework
- reports
- superadmin
- AI assistant ב-WhatsApp

### Planned, לא baseline לעיצוב הנוכחי

- i18n infrastructure + English
- SaaS billing של LESSIO מול הלקוחות שלו
- international launch readiness
- GDPR
- URL-based locales
- Arabic
- Stripe כ-payment provider גלובלי

צוות UI/UX צריך לעצב קודם את המוצר כפי שהוא קיים היום, ורק אחר כך לשקול מה נדרש כדי לאפשר התרחבות עתידית.

## 9. Known Doc Drift

יש פערים בין חלק מהמסמכים ההיסטוריים לבין המצב הנוכחי בפועל.

### `docs/status.md`

הקובץ מציג כותרת של Sprint 17 ומכיל section של "What's Missing" שכבר אינו נכון במלואו. למשל:

- parent portal כבר קיים
- `/settings` landing page כבר קיים
- single lesson creation כבר קיים

יש להשתמש בו בעיקר להבנת יכולות, לא להבנת current sprint או gaps נוכחיים.

### `docs/first-customer.md`

החלקים המאוחרים בקובץ מתארים limits של pilot phase ישן, למשל:

- אין payment processing
- אין automated reminders
- אין recurring lessons
- אין parent portal

כל אלה אינם משקפים עוד את מצב המוצר בקוד.

### היררכיית אמינות מומלצת

כאשר יש סתירה, יש להעדיף:

1. קוד ומיגרציות
2. `docs/plan.md`
3. `docs/sprint-roadmap.md`
4. מסמכי status / onboarding ישנים

## 10. Framing מומלץ למסירת UX

כדי לייצר שפה UX מדויקת, מומלץ למסגר את LESSIO כך:

- מערכת תפעול לעסקי הוראה עם WhatsApp כערוץ שירות ראשי
- dashboard לצוות פנימי
- מרחב ביצוע מצומצם למורים
- self-service mobile-first להורים
- transactional booking flow נפרד, מהיר ופשוט
- שכבת platform admin עבור מפעיל המוצר

## 11. References מרכזיים

### מסמכי מוצר

- `docs/plan.md`
- `docs/sprint-roadmap.md`
- `docs/status.md`
- `docs/first-customer.md`

### קבצי UI ו-routing

- `src/app/layout.tsx`
- `src/app/login/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/components/dashboard/Sidebar.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/reports/page.tsx`
- `src/app/(admin)/admin/layout.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/app/portal/[orgId]/layout.tsx`
- `src/app/portal/[orgId]/home/page.tsx`
- `src/app/book/[token]/page.tsx`
- `src/proxy.ts`

### Domain and data model

- `src/lib/auth/session.ts`
- `supabase/migrations/20260321000001_schema.sql`
- migrations later than `20260321000001_schema.sql` for portal, homework, reminders, receipts, superadmin and AI assistant

## 12. מסקנה קצרה

LESSIO הוא מוצר תפעולי רב-שכבתי, לא רק dashboard. הוא מחבר בין back office, מורים, הורים וערוץ WhatsApp למערכת אחת עם הרשאות ברורות וזרימות ממוקדות. עבור UI/UX, ההצלחה תלויה ביכולת לעצב מוצר שמרגיש אחיד, אבל מבדיל נכון בין context תפעולי פנימי, self-service חיצוני, וזרימות מהירות שנובעות מהודעות WhatsApp.
