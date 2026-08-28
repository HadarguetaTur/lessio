# Sprint 33 — Integration Hub

*מסמך הסקופ של הספרינט. מממש את החלטה #28 ב-`docs/decisions.md` ("Integration Hub Shape") ואת החלטה #30 ("Tenant-Owned Channel and Integration Credentials").*

---

## למה

שני צרכים שהתגלו כצורך אחד.

**1. אינטגרציות כלליות.** בעלי עסקים רוצים לחבר את Lessio לכלי אוטומציה — Make, n8n, קלוד — ולבנות תהליכים משלהם: ליד מטופס באתר יוצר תלמיד, תשלום שנכנס נרשם בגוגל שיטס, סיכום שבועי נשלח אוטומטית.

**2. עלות ה-API של Grow.** Grow גובים ₪500 + מע"מ לחודש על גישת API. **Grow אישרו במפורש** שגישה דרך Make אינה כלולה בחיוב הזה. לקוח שמשלם ~$9 לחודש על Make חוסך ~₪490.

**התובנה שקושרת ביניהם:** תשלום דרך Make הוא בדיוק אותם שני כיווני התקשורת של האינטגרציה הכללית — Lessio מצלצל החוצה כדי לקבל לינק, והתרחיש קורא בחזרה כדי לסמן ששולם. אין כאן פיצ'ר תשלומים נפרד; זה הלקוח הראשון של ה-API הציבורי.

---

## מיילסטונים

| | תוכן | סטטוס |
|---|---|---|
| **M1** | מפתחות API, `/api/v1`, ספק תשלום `make`, מסך הגדרות | ✅ בוצע |
| **M2** | Webhooks יוצאים + שאר ה-REST | 📝 מתוכנן |
| **M3** | שרת MCP לקלוד | 📝 מתוכנן |

---

## M1 — מה נבנה

### תיקון מקדים: המכסות לא נאכפו כלל

`quota.ts` קרא את `students_quota` ו-`lessons_monthly_quota` מאובייקט שה-`select` ב-`plans.ts` מעולם לא הביא. שתי המכסות חזרו כ-`undefined`, ו-`undefined == null` הוא `true` — כלומר `requireQuotaCapacity` יצא מוקדם בכל קריאה ואף תוכנית לא אכפה דבר. ה-cast ל-`as Record<string, unknown>` הוא מה שהסתיר את זה מהקומפיילר.

תוקן לפני פתיחת ה-API, כי `POST /api/v1/students` (M2) יאפשר יצירת רשומות בכמות. `src/lib/saas/quota.test.ts` מכסה את זה כרגרסיה.

### מפתחות API

- טבלה `organization_api_keys`. פורמט `lsk_live_<43 תווי base64url>` מ-32 בייטים אקראיים.
- **נשמר כ-sha256, לא מוצפן.** שאר הסודות בקוד הם קרדנציאלים של צד ג' שצריך לשחזר ולשלוח שוב (api key של Grow, refresh token של Gmail) — ולכן מוצפנים והפיכים. מפתח API הוא ההפך: אנחנו מנפיקים אותו וצריכים רק לזהות אותו מחדש. דלף של ה-DB לא מחלק מפתחות עובדים.
- המפתח מוצג פעם אחת ואינו ניתן לשחזור.
- Scopes: `read`, `write`, `messages:send`. `messages:send` מופרד כי הוא מוציא הודעות מה-WABA של הארגון — רדיוס הנזק הגדול ביותר.

### `/api/v1` והשומר המשותף

`withApiAuth` ב-`src/lib/api/handler.ts` מריץ את אותו רצף לכל endpoint:

```
authenticate → rate limit → scope → plan feature → handler → log
```

**כלל ברזל לראוטים תחת `/api/v1`:** לעולם לא לקרוא ל-`getSession()` או ל-`requireFeature()`. שניהם עונים על כישלון ב-`redirect()`, שמגיע לאוטומציה כ-307 לדף התחברות או חיוב — נעקב, נטען, ומדווח כהצלחה. לכן נוסף `assertFeature()` שזורק `FeatureNotAvailableError` במקום להפנות.

Rate limit: 120 בקשות לדקה למפתח, DB-backed מעל `api_request_log` לפי הדפוס של `isRateLimited` ב-`src/lib/whatsapp/idempotency.ts`. מונה in-memory היה שגוי כאן — על Vercel לכל מופע lambda יש מפה משלו. **נכשל פתוח** בשגיאת שאילתה, כמו המגביל של WhatsApp; האימות עצמו **נכשל סגור**.

Endpoints ב-M1:
- `GET /api/v1/me` — הקריאה הראשונה שכל אחד עושה. הכי זולה בכוונה: כל מצבי הכישלון של השומר מתגלים כאן, בחינם.
- `POST /api/v1/charges/:id/payments` — הרגל החוזרת של ספק `make`.

### ספק תשלום `make`

Lessio שולח POST לכתובת webhook שהארגון מגדיר; התרחיש מדבר עם ספק הסליקה ומחזיר קישור תשלום **באותה קריאה** (מודול "Webhook response" ב-Make, "Respond to Webhook" ב-n8n).

**ה-reference נטבע אצלנו** (`mk_<uuid>`), לא מתקבל מהתרחיש — אותו היגיון כמו ה-`processToken` של Grow: ייחודי, בעל אנטרופיה גבוהה, ומוכר רק ל-Lessio ולתרחיש של הארגון.

אין `verifyWebhookRequest`: הוא סינכרוני ולכן לא יכול לפענח config פר-ארגון (זו הסיבה ל-`return true` עם ה-TODO אצל Stripe). מסלול הסגירה הנתמך — קריאת API עם Bearer — עוקף את המגבלה לגמרי. `POST /api/payments/make` נתמך כחלופה למי שמעדיף webhook פשוט.

**שדה יחיד בטופס בכוונה.** `PaymentProviderForm` מקודד `required` על כל שדה, אז ספק עם שדה אופציונלי היה מחייב שינוי שם ושובר את הבטחת "registry + קטלוג בלבד".

---

## החלטות שהתקבלו בדרך

| החלטה | למה |
|---|---|
| sha256 ולא `encryptWithKey` למפתחות | מפתח אקראי בעל אנטרופיה גבוהה — אין מה לפצח, ואין צורך בהפיכות |
| Scopes גסים (`read`/`write`) ולא לפי משאב | אפשר לפצל בהמשך בלי שבירת תאימות; ההפך לא נכון |
| חיוב ששולם כבר מחזיר 200 ולא 409 | תרחיש Make שמנסה שוב על שגיאה היה נכנס ללולאה אינסופית |
| `method: 'provider'` כברירת מחדל | הכסף נלקח על ידי סולק אמיתי, לא נמסר ביד — משנה לדוחות ההכנסה |
| `actorProfileId: null` | `charge_payments.recorded_by_profile_id` כבר מתועד כ-"NULL = webhook ולא אדם" |

---

## מה נשאר ל-M2 / M3

- Webhooks יוצאים: `org_webhook_endpoints` + `webhook_deliveries` כ-outbox, `emitOrgEvent`, חתימת HMAC בפורמט Stripe, retry דרך Edge Function cron.
- שאר ה-REST: students, lessons, parents, leads, ו-`POST /v1/messages/whatsapp`.
- שרת MCP.
- `INTEGRATIONS_ENCRYPTION_KEY` ב-`env.ts` — נדרש רק ב-M2, כשיהיו סודות של webhook לשמור.

---

## מחוץ לסקופ

- אפליקציית Zapier רשמית (דורשת פרסום ואישור אצל Zapier).
- בונה אוטומציות ויזואלי פנימי — **מוחרג במפורש בהחלטה #28**.
- OAuth לצד ג' — מפתחות API מספיקים ל-Make, n8n ו-MCP.
- Scopes ברמת משאב.
