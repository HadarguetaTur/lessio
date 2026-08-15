# Post-Launch Checklist — Lessio

משימות ידניות שלא ניתן לבצע בקוד. יש לסמן כל משימה לאחר השלמתה.

---

## 🔴 חובה לפני עליה לאוויר

### Supabase — סביבת Production

- [ ] הגדרת Edge Function crons ב-Supabase Dashboard תחת **Edge Functions → Schedules**:
  | Function | Schedule | תיאור |
  |---|---|---|
  | `lesson-reminders` | `0 * * * *` | תזכורות שיעורים — כל שעה |
  | `payment-reminders` | `0 9 * * *` | תזכורות תשלום — יום יום ב-09:00 UTC |
  | `homework-reminders` | `0 8 * * *` | תזכורות שיעורי בית — יום יום ב-08:00 UTC |
  | `saas-subscription-checker` | `0 0 * * *` | בדיקת סטטוס מנויי SaaS — חצות UTC |
  | `saas-renewal-reminder` | `0 8 * * *` | התראת חידוש מנוי לowner — יום יום ב-08:00 UTC |
  | `data-retention` | `0 3 * * *` | אנונימיזציית conversation_log + whatsapp_processed_messages — יום יום ב-03:00 UTC |
  | `homework-sender` | `0 * * * *` | שליחת שיעורי בית מתוזמנים דרך WhatsApp — כל שעה |

- [ ] הגדרת Environment Secrets לכל Edge Function ב-Supabase Dashboard:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `WHATSAPP_TOKEN_ENCRYPTION_KEY`

### Env Vars — Production (Vercel / שרת)

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `BOOKING_JWT_SECRET` — מחרוזת אקראית ≥32 תווים
- [ ] `PORTAL_JWT_SECRET` — מחרוזת אקראית ≥32 תווים
- [ ] `SUPPORT_SESSION_SECRET` — מחרוזת אקראית ≥32 תווים
- [ ] `WHATSAPP_APP_SECRET` — מ-Meta App Dashboard
- [ ] `WHATSAPP_VERIFY_TOKEN` — מחרוזת אקראית שתוזן גם ב-Meta
- [ ] `WHATSAPP_TOKEN_ENCRYPTION_KEY` — hex string של 64 תווים
- [ ] `META_APP_ID` — מ-Meta App Dashboard
- [ ] `META_APP_SECRET` — מ-Meta App Dashboard
- [ ] `PAYMENT_CONFIG_ENCRYPTION_KEY` — hex string של 64 תווים
- [ ] `OPENAI_API_KEY` — מ-OpenAI
- [ ] `AI_CONFIG_ENCRYPTION_KEY` — hex string של 64 תווים (Sprint 25 — להצפנת מפתחות AI per-org)
- [ ] `RESEND_API_KEY` — מ-Resend Dashboard (Sprint 25 — שליחת אימיילים)
- [ ] `RESEND_FROM_EMAIL` — כתובת השולח שאומתה ב-Resend, למשל `noreply@lessio.co.il`
- [ ] `SUMIT_COMPANY_ID` — מספר החברה ב-Sumit
- [ ] `SUMIT_API_KEY` — API key מ-Sumit
- [ ] `SUMIT_WEBHOOK_SECRET` — מחרוזת אקראית שתוזן גם ב-Sumit
- [ ] `NEXT_PUBLIC_APP_URL` — URL הייצור המלא (ללא slash בסוף), למשל `https://app.lessio.co.il`

---

## 🟡 Sumit — הגדרת Webhook

- [ ] היכנסי לממשק Sumit → **הגדרות API** או **Webhooks**
- [ ] הגדירי Webhook URL: `https://app.lessio.co.il/api/sumit/webhook`
- [ ] הגדירי Secret לאימות (יכנס כ-`SUMIT_WEBHOOK_SECRET` ב-Vercel)
- [ ] ודאי שה-Webhook שולח אירועי **תשלום הושלם** (Payment Success)
- [ ] בצעי תשלום טסט ↔ וודאי שהארגון עובר לסטטוס `active` ב-DB

---

## 🟡 Meta WhatsApp — הגדרה ראשונית

> **מוקדם מדי:** יש לבצע רק לאחר פתיחת Meta Business App רשמי.

- [ ] פתחי Meta Business Account + App מסוג Business
- [ ] הוסיפי WhatsApp Product ל-App
- [ ] רשמי Webhook Callback URL: `https://app.lessio.co.il/api/whatsapp/webhook`
- [ ] הזיני `WHATSAPP_VERIFY_TOKEN` ב-Meta (חייב להיות זהה ל-env var)
- [ ] הרשמי לאירוע Webhook: `messages`
- [ ] ודאי שה-App עבר לסטטוס Live (לא Sandbox)

### Meta Approved Templates — שליחת הודעות יזומות

> נדרש לשלוח הודעות WhatsApp מעבר לחלון 24 שעות.
> **אין צורך בהגשה ידנית** — התבניות נרשמות אוטומטית ל-WABA של כל לקוח בעת החיבור (`registerTemplatesForWABA`, קטגוריית UTILITY שבד"כ מאושרת אוטומטית). ה-runbook המלא: `docs/sprint-31-scope.md` → Ops / Meta Runbook.

- [ ] ודאי שהתבניות הבאות (מ-`src/lib/whatsapp/registerTemplates.ts`) אושרו ב-WABA של כל ארגון מחובר:
  | שם תבנית | שימוש |
  |---|---|
  | `lessio_lesson_reminder_he` | תזכורת שיעור להורים |
  | `lessio_payment_reminder_he` | תזכורת תשלום להורים |
  | `lessio_payment_request_he` | בקשת תשלום עם לינק |
  | `lessio_homework_reminder_he` | תזכורת שיעורי בית |
  | `lessio_homework_assignment_he` | שיעורי בית חדשים |
  | `lessio_homework_graded_he` | שיעורי בית נבדקו |
- [ ] לארגונים שחוברו לפני Sprint 31: הריצי `npx tsx scripts/backfill-waba-subscriptions.ts` (רושם subscribed_apps + תבניות)

---

## 🟢 לאחר עליה לאוויר — לקוח ראשון

- [ ] יצרי ארגון ראשון דרך `/admin/orgs/new` (superadmin)
- [ ] שלחי קישור onboarding לבעל העסק
- [ ] ודאי שה-onboarding מסתיים ועוברים ל-`/dashboard`
- [ ] ודאי שהמנוי רשום ו-Sumit מחייב נכון
- [ ] בדקי שהתראת חידוש מנוי מגיעה 2 ימים לפני

---

## 🟡 Resend — הגדרת שליחת אימיילים (Sprint 25)

- [ ] פתחי חשבון Resend ([resend.com](https://resend.com))
- [ ] הוסיפי דומיין (למשל `lessio.co.il`) ב-Resend → **Domains**
- [ ] הוסיפי DNS records ב-רשם הדומיין (MX, SPF, DKIM) לפי הוראות Resend
- [ ] המתיני לאימות הדומיין (בד״כ עד שעה)
- [ ] יצרי API key ב-Resend → **API Keys** והזיני ב-`RESEND_API_KEY`
- [ ] הזיני את כתובת השולח המאומתת ב-`RESEND_FROM_EMAIL`

---

## 🔵 עתידי — Sprint 26 ואילך

- [ ] **ערבית (`ar.json`):** אם יש דוברי ערבית בבסיס הלקוחות — הוסיפי תרגום + RTL support
- [ ] **Meta Templates לערבית:** הגישי גרסאות ערבית של כל התבניות

---

## 📋 הפקת מפתחות — איך ליצור secrets אקראיים

```bash
# hex string 64 תווים (לmencryption keys)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# מחרוזת אקראית כללית (לJWT secrets, webhook secrets)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
