# Sprint 34 — Platform Admin & Growth Console

*אפיון מחדש של `/admin`. נכתב אחרי סקירה מלאה של המצב הקיים (2026-08-30).*

---

## למה

`/admin` נבנה בספרינט 18 ככלי תפעול למוצר לפני הכנסות: רשימת ארגונים, מי לא סיים הגדרה, ומי פנה בתמיכה. מאז נוספו לו טלאים — תמיכה, באגים חוזרים, פניות לתוכנית מותאמת — אבל **הצורה נשארה של ספרינט 18**. שלוש בעיות מבניות, לא ליקויי עיצוב.

### 1. הוא מודד את המדד הלא נכון

`getPlatformDashboard()` ב-`src/lib/superadmin/dashboard.ts` מציג ארבעה מספרים: מספר ארגונים, ארגונים פעילים ב-30 יום, שיעורים החודש, ו**הכנסות החודש מ-`charges`**.

`charges` היא הטבלה שבה מורה מחייב הורה. זו ההכנסה של הטננט, לא של Lessio. אותו דבר ב-`/admin/billing` — `getBillingReadiness()` מסכם `charges` שסטטוסן `paid` פר ארגון. **המסך שנקרא "Billing" בפאנל הניהול של חברת SaaS לא מציג ולו שקל אחד מההכנסות של אותה חברה.**

הנתונים של Lessio עצמה קיימים ב-DB ואין להם מסך:

| טבלה | מה יש בה | מי קורא אותה |
|---|---|---|
| `organization_subscriptions` | תוכנית, סטטוס (`trial`/`active`/`past_due`/`cancelled`/`read_only`), `trial_ends_at`, `current_period_end`, `cancel_at_period_end`, `card_last_four` | רק `/account/billing` של הארגון עצמו |
| `saas_invoices` | חשבוניות Sumit של הפלטפורמה | רק `listSaasInvoices(orgId)` לארגון |
| `saas_plans` | מחירים, `features`, `students_quota`, `lessons_monthly_quota` | קריאה בלבד; **שינוי מחיר מחייב SQL ידני** |
| `whatsapp_usage_cache` | עלות ההודעות פר ארגון | רק `/settings/whatsapp` של הארגון |
| `ai_usage_log` | טוקנים ועלות AI פר ארגון | רק לשונית ה-usage של הארגון |

אין MRR. אין נטישה. אין המרת ניסיון-לתשלום. אין מרווח גולמי פר לקוח — למרות ששני מרכיבי העלות (WhatsApp, AI) כבר נאספים.

### 2. אין שכבת צמיחה בכלל

- **אפס טרקינג בקוד.** אין `gtag`, אין `fbq`, אין `dataLayer`, אין GTM, אין PostHog, אין תג `<script>` אחד ב-`src/`. `src/app/layout.tsx` נקי לגמרי.
- **ומדיניות הפרטיות כבר מבטיחה אותם.** `src/app/privacy/PrivacyHe.tsx:169-170,453-454` (וה-`En` המקביל) מונים במפורש Meta Pixel, Google Analytics 4, PostHog ו-Hotjar כצדדים שלישיים וכקטגוריות עוגיות. פער תאימות בכיוון ההפוך מהרגיל — המדיניות מקדימה את הקוד, ואין באנר הסכמה בריפו.
- **אין ליד קר.** `saas_plan_inquiries` דורשת `organization_id` — היא בקשת שדרוג של ארגון שכבר נרשם, לא ליד. `leads` היא טננטית ונכתבת רק מוובהוק WhatsApp של הארגון. **אין שום מסלול שבו אדם שראה מודעה נכנס למערכת.**
- **דף הנחיתה לא אוסף כלום.** `src/lib/marketing/landingCopy.ts:317-320` מגדיר שני קישורים בלבד: `/login` ו-`/signup`. אין טופס, אין סקשן תמחור, אין הוכחה חברתית.
- **אין ייחוס.** `signUp` ב-`src/app/signup/actions.ts` לא קולט UTM, לא referrer, לא `fbclid`/`gclid`. גם אם ירוץ קמפיין — אי אפשר לדעת מה עבד.

### 3. חסר עומק תפעולי

- **אין ניהול תוכניות ומנויים.** אי אפשר להאריך ניסיון, להעביר תוכנית, לסמן `past_due`, לבטל, או לתת החרגת פיצ'ר. הכתיבה היחידה ל-`organization_subscriptions` מכל הפאנל היא פותר פניות התוכנית המותאמת, שמקודד `custom` + חודשי + חודש אחד.
- **אין מכסות.** `getOrgQuotaUsage()` קיימת ואף פעם לא נקראת מ-`/admin`. אין תור "ארגונים שקרובים לתקרה" — הרמז הכי חזק לשדרוג שיש.
- **שאילתות O(כל השורות).** `dashboard.ts:98-102` ו-`buildLastActivityMap()` ב-`organizations.ts` מושכים את **כל** `lessons`, `charges` ו-`leads` בפלטפורמה, בלי `limit` ובלי סינון תאריך, ומקפלים ב-JS. הסינון של רשימת הארגונים גם הוא ב-JS אחרי משיכת הכל. אין עימוד בשום מסך.
- **אין תיעוד פעולות אדמין.** כניסה ויציאה ממצב תמיכה, עריכת ארגון, ייצוא נתונים — הכל `console.info` בלבד.
- **פרטים שנשארו באוויר:** `/admin` החשוף מחזיר 404 (אין ראוט אינדקס); `countOpenTickets()` ו-`countOpenDevIssues()` מיוצאות ולא מוצגות באף מקום — אין תגי ספירה בסיידבר; `listUnlinkedOpenIssues()` לא מסננת "לא מקושר" אלא רק מאצילה ל-`listDevIssues`; `exitSupportModeAction` היא פעולת האדמין היחידה בלי `requireSuperAdminSession()`.

---

## העיקרון

ל-`/admin` יש שלוש עבודות, והמבנה הנוכחי מכיר רק בשלישית:

| | עבודה | השאלה שהמסך עונה עליה | מה יש היום |
|---|---|---|---|
| **להשיג** | Growth | מאיפה מגיעים לקוחות, מה ההמרה, כמה זה עולה | כלום |
| **להחזיק** | Revenue | כמה אנחנו מרוויחים, מי נוטש, מי רווחי | כלום |
| **להפעיל** | Operations | מה שבור, מי צריך עזרה, מי תקוע | חלקי |

האפיון מסודר לפי שלוש העבודות האלה.

---

## מבנה המידע החדש

הסיידבר השטוח בן 6 הפריטים (`src/components/admin/AdminSidebar.tsx`) הופך למקובץ, עם תגי ספירה חיים והוספת חיפוש גלובלי.

```
LESSIO ADMIN                     ⌘K

  סקירה                          /admin

  צמיחה
    לידים                        /admin/leads            [12]
    קמפיינים                     /admin/campaigns
    ייחוס ומשפך                  /admin/attribution
    מדידה וטרקינג                /admin/tracking

  לקוחות
    ארגונים                      /admin/orgs
    מנויים                       /admin/subscriptions    [3 past due]
    הכנסות                       /admin/revenue

  תפעול
    תמיכה                        /admin/support          [5]
    באגים חוזרים                 /admin/dev-issues       [2]
    שגיאות                       /admin/errors
    עלות תפעול                   /admin/cost

  פלטפורמה
    תוכניות ופיצ'רים             /admin/plans
    יומן פעולות                  /admin/audit
```

שינויים רוחביים בשל:

- **`/admin` הופך לראוט אמיתי** — היום הוא 404. `/admin/dashboard` יעשה `redirect` אליו כדי לא לשבור סימניות.
- **פלטת חיפוש (⌘K)** — ניווט, קפיצה לארגון לפי שם, ופעולות מהירות ("היכנס כ…", "הארך ניסיון…"). ה-`registry.ts` של הדשבורד כבר מדגים את הדפוס; נבנה מקבילה ל-`admin`.
- **תגי ספירה** — `countOpenTickets()` ו-`countOpenDevIssues()` כבר קיימות ולא בשימוש. מחברים אותן, ומוסיפים ספירת לידים חדשים ומנויים ב-`past_due`.
- **טוקנים במקום צבעים קשיחים.** הסיידבר מערבב `bg-gray-900` עם `text-muted-foreground` — טוקן בהיר על רקע כהה, ולכן טקסט כמעט בלתי קריא. עוברים לטוקנים של המערכת בשני המצבים.
- **`/admin/orgs/[id]` הופך ללשוניות** במקום ערימת כרטיסים אחת.
- **עימוד + סינון בשרת בכל רשימה**, וייצוא CSV מכל טבלה.
- **`AdminTable` משותף** — היום כל מסך מגלגל טבלה משלו (`OrganizationsTable`, `BillingReadinessTable`, רשימות ידניות ב-support ו-dev-issues). רכיב אחד עם עימוד, מיון, בחירה מרובה וייצוא.

---

## אפיון מסכים

### `/admin` — סקירה

מחליף את `PlatformKpiGrid` הנוכחי. ארבעה בלוקים:

**1. שורת ה-SaaS** (השורה שחסרה היום לגמרי)

| מדד | הגדרה |
|---|---|
| MRR | סכום על `organization_subscriptions` בסטטוס `active`/`past_due`, של `price_monthly` או `price_yearly / 12` לפי `billing_interval` |
| ARR | `MRR × 12` |
| שינוי נטו החודש | MRR חדש + הרחבה − כיווץ − נטישה |
| ניסיונות פעילים | `status = 'trial'`, מתוכם כמה נגמרים ב-7 הימים הקרובים |
| המרת ניסיון→תשלום | ניסיונות שהתחילו ב-90 הימים שקדמו והפכו ל-`active` |
| נטישה | `cancelled_at` בחודש ÷ פעילים בתחילתו, בלקוחות ובכסף |
| ARPA | MRR ÷ ארגונים משלמים |

**2. משפך ההפעלה** — כמה נכנסו לכל שלב ב-30 יום, וכמה זמן לוקח לעבור:

`ליד → הרשמה → אימות מייל → סיום אונבורדינג → שיעור ראשון → חיוב ראשון → תשלום ראשון`

זה המסך שאומר איפה נופלים. `onboarding_completed` על `organizations` כבר קיים; שאר השלבים נגזרים מ-`profiles`, `lessons` ו-`charges`.

**3. תשומת לב עכשיו** — תור פעולות מאוחד, ממוין לפי דחיפות: מנויים ב-`past_due`, ניסיונות שנגמרים השבוע, ארגונים שחצו 80% ממכסה, טיקטים פתוחים מעל 24 שעות, `error_events` שקפצו, ארגונים ללא WhatsApp/סליקה. מחליף את `NeedsSetupList` שבודק שני שדות בלבד.

**4. צמיחה בקצרה** — לידים חדשים, המרה לליד-משלם, CAC ו-LTV:CAC בחודש האחרון, עם קישור ל-`/admin/attribution`.

> **חוב ביצועים שנסגר כאן:** כל המדדים לעיל מחושבים ב-SQL (Postgres views + RPC) ולא ב-JS. `dashboard.ts` ו-`buildLastActivityMap()` הנוכחיות נמחקות. במקומן `organization_activity` — view מטריאלייזד שמחזיק `last_activity_at` פר ארגון, מרוענן ב-cron.

### `/admin/leads` — CRM

**רשימה:** אינבוקס עם מצבים שמורים (חדשים / בטיפול / מוסמכים / כולם), חיפוש, סינון לפי מקור-קמפיין-סטטוס-בעלים, בחירה מרובה, ייצוא CSV.

עמודות: שם · טלפון/מייל · מקור · קמפיין · סטטוס · ציון · נוצר · פעילות אחרונה.

**כרטיס ליד:** פרטי קשר, **ייחוס מלא** (מקור, מדיום, קמפיין, מודעה, דף נחיתה, referrer, `fbclid`/`gclid`, תאריך מגע ראשון), ציר זמן של כל מה שקרה, איזור פעולות (עדכון סטטוס, הערה, שיוך בעלים, שליחת WhatsApp, **המרה לארגון**), ורשומת ההסכמה.

**צינור:** `new → contacted → qualified → trial → won → lost` עם סיבת אובדן. תצוגת לוח או רשימה.

**המרה:** "המרה לארגון" יוצרת ארגון דרך `createOrganization()` הקיימת, כותבת `converted_org_id` על הליד, ומעתיקה את הייחוס לארגון — כך שהמנוי שייווצר בהמשך יידע מאיזה קמפיין הוא בא. זה מה שמאפשר CAC אמיתי.

**`saas_plan_inquiries` מתמזגות לכאן.** מסך `/admin/saas-inquiries` הנפרד נמחק; פנייה לתוכנית מותאמת נכנסת לאותו אינבוקס עם `source = 'plan_inquiry'` ועם הארגון המקושר. פעולת `resolveSaasPlanInquiryAction` עוברת ל-`/admin/subscriptions` שם היא שייכת — ומפסיקה לקודד `custom`/חודשי/חודש אחד: המפעיל בוחר תוכנית, מחזור ותקופה.

### `/admin/campaigns` — קמפיינים ותקציב

טבלת קמפיינים: שם, ערוץ, תקציב, תאריכים, פרמטרי UTM, יעד.

לכל קמפיין מחושב: הוצאה · לידים · הרשמות · משלמים · CAC · LTV משוער · החזר בחודשים.

**הוצאה מוזנת ידנית ברמת חודש-קמפיין** בגרסה הראשונה. משיכה אוטומטית מ-Meta Marketing API ומ-Google Ads היא סקופ נפרד ולא תלויה בשאר.

### `/admin/attribution` — ייחוס ומשפך

- משפך לפי מקור: מגע ראשון → ליד → הרשמה → ניסיון → משלם, עם שיעורי מעבר.
- טבלת מקורות: כמה לידים, איכות (אחוז מוסמכים), CAC, LTV.
- **מגע ראשון מול מגע אחרון** זה לצד זה — בערוץ עם מחזור מכירה ארוך הפער בין השניים הוא כל הסיפור.
- קוהורטות לפי חודש הרשמה: שימור וכסף.

### `/admin/tracking` — מדידה

מסך הגדרות ליעדי מדידה. לכל יעד: ספק, מזהה, מופעל/כבוי, טוקן צד-שרת (מוצפן), קוד אירוע בדיקה, קטגוריית הסכמה.

יעדים נתמכים: `meta_pixel` · `ga4` · `gtm` · `google_ads` · `tiktok` · `linkedin`.

מתחת: יומן האירועים ששוגרו ב-24 השעות האחרונות עם סטטוס מסירה — הכלי שאומר "האירוע הגיע ל-Meta או לא", במקום לנחש.

וכפתור "בדיקה" ששולח אירוע בדיקה לכל יעד מופעל.

> **המזהים חיים ב-DB, לא ב-`NEXT_PUBLIC_*`.** Next 16 מטמיע משתני `NEXT_PUBLIC_` בזמן build — פיקסל שמוגדר כך מחייב דיפלוי כדי להתחלף, ומשתנה בין סביבות בדרכים לא צפויות. הסקריפט נרנדר בשרת מתוך `tracking_destinations`, ולכן החלפת פיקסל היא שינוי במסך.

### `/admin/orgs` ו-`/admin/orgs/[id]`

**רשימה** — עמודות אמיתיות: שם · תוכנית · סטטוס מנוי · MRR · תלמידים / מכסה · שיעורים 30י · פעילות אחרונה · ציון בריאות. סינון ומיון בשרת, עימוד, בחירה מרובה, ייצוא.

**כרטיס ארגון — לשוניות:**

| לשונית | תוכן |
|---|---|
| סקירה | פרטים, מדדי שימוש, ציר זמן פעילות |
| מנוי | תוכנית, סטטוס, ניסיון, חשבוניות `saas_invoices`, כרטיס. פעולות: **החלפת תוכנית · הארכת ניסיון · סימון `past_due` · ביטול · זיכוי** |
| שימוש ומכסות | `getOrgQuotaUsage()` הקיימת + מגמה, ואיפה קרוב לתקרה |
| ערוצים | WhatsApp (חיבור, סטטוס תבניות, עלות), סליקה, קבלות, Google Calendar, Gmail, מפתחות API |
| עלות ומרווח | עלות WhatsApp + AI מול מחיר התוכנית |
| תמיכה | טיקטים ושגיאות של הארגון |
| אזור מסוכן | ייצוא, בקשות מחיקה, השהיה |

הפעולות ההרסניות דורשות אישור מוקלד ונרשמות ל-`admin_audit_log`.

### `/admin/subscriptions` ו-`/admin/revenue`

**מנויים** — כל המנויים עם סינון סטטוס. תורים מובנים: `past_due`, ניסיונות שנגמרים, מבוטלים בסוף תקופה. פעולות בכמות.

**הכנסות** — MRR לאורך זמן עם פירוק (חדש / הרחבה / כיווץ / נטישה), `saas_invoices` עם סטטוס וקישור למסמך Sumit, חובות פתוחים, וחיובים שנכשלו.

### `/admin/plans` — תוכניות ופיצ'רים

עורך ל-`saas_plans`: מחיר חודשי ושנתי, מכסות, מתגי `features`, `is_active`, סדר.

**החרגות פר ארגון** — טבלה חדשה `org_feature_overrides` שמאפשרת לפתוח פיצ'ר או להרחיב מכסה ללקוח מסוים בלי להמציא תוכנית. `getEffectiveSaasFeatures()` תמזג אותה מעל הפיצ'רים של התוכנית.

שינוי מחיר לא נוגע במנויים קיימים — המחיר נלכד על המנוי בעת ההרשמה.

### `/admin/errors`, `/admin/cost`, `/admin/audit`

- **שגיאות** — פיד `error_events` לפי טביעת אצבע, לפני שקודמה ל-`dev_issue`. היום שגיאה שלא קודמה בלתי-נראית.
- **עלות תפעול** — ריכוז WhatsApp (`whatsapp_usage_cache`) + AI (`ai_usage_log`) פר ארגון ובסך הכל, מול MRR. הצד השני של המשוואה שאף פעם לא נראה.
- **יומן פעולות** — `admin_audit_log`: מי נכנס לאיזה ארגון, מי שינה מה, מי ייצא נתונים. חובה לפני שיש יותר מסופר-אדמין אחד, ומועיל בלעדיו.

---

## מודל הנתונים

מיגרציה אחת. שמות בתחילית `platform_` מפרידים מפורשות מ-`leads` הטננטית שנשארת כפי שהיא.

```sql
-- לידים של Lessio עצמה. נפרד מ-leads הטננטית בכוונה:
-- זו לא אותה ישות ולא אותו קהל.
platform_leads (
  id, name, email, phone, company,
  status,        -- new|contacted|qualified|trial|won|lost
  lost_reason, score, owner_profile_id, notes,
  source, medium, campaign, content, term,      -- UTM כפי שנתפס
  campaign_id,   -- FK ל-marketing_campaigns אם הותאם
  landing_path, referrer, gclid, fbclid, visitor_id,
  form_id,       -- FK ל-lead_forms
  consent_marketing, ip_hash, user_agent,
  converted_org_id, converted_at,
  created_at, updated_at
)
UNIQUE (email) WHERE email IS NOT NULL   -- שליחה כפולה מעדכנת, לא מכפילה

platform_lead_events (id, lead_id, type, payload jsonb, actor_profile_id, created_at)
-- type: form_submit | status_change | note | email | call | page_view
--     | signup | trial_start | paid | whatsapp_in | whatsapp_out

marketing_campaigns (id, name, channel, utm_campaign, budget, currency,
                     starts_on, ends_on, is_active, notes)
marketing_campaign_spend (id, campaign_id, month, amount)   -- הזנה ידנית

lead_forms (id, name, form_key, field_map jsonb, campaign_id,
            allowed_origins text[], notify_emails text[], is_active, created_at)

tracking_destinations (id, provider, label, external_id,
                       config_encrypted,      -- טוקן CAPI / API secret
                       test_event_code, consent_category,
                       is_enabled, created_at, updated_at)

tracking_events (id, event_name, event_id, destination_id,
                 lead_id, organization_id, visitor_id,
                 value, currency, payload jsonb,
                 status,          -- pending|sent|failed
                 attempts, error, created_at, sent_at)

attribution_touches (id, visitor_id, touch_index, source, medium, campaign,
                     content, term, referrer, landing_path, gclid, fbclid,
                     created_at)

org_feature_overrides (organization_id PK, features jsonb,
                       students_quota, lessons_monthly_quota,
                       note, expires_at, created_by, created_at)

admin_audit_log (id, actor_profile_id, action, target_type, target_id,
                 organization_id, metadata jsonb, ip_hash, created_at)
```

עמודות ייחוס נוספות על `organizations`: `attribution jsonb`, `platform_lead_id`.

RLS: כל הטבלאות עם RLS מופעל ובלי מדיניות — גישת service-role בלבד, כמו `organization_api_keys` ו-`charge_audit_log`. כל מי שקורא אותן עבר כבר דרך `requireSuperAdminSession()`.

---

## מנוע המדידה

זה החלק שקושר הכל, ולכן שווה לתאר במפורש.

### שלב 1 — לכידת ייחוס

`src/proxy.ts` (שכבר רץ על כל בקשה) שותל עוגיית `ls_vid` — מזהה מבקר אקראי, שנה — ועוגיית מגע-ראשון `ls_attr` עם UTM, referrer, נתיב נחיתה ו-`gclid`/`fbclid`. מגע ראשון **לא נדרס**; מגעים נוספים נכתבים ל-`attribution_touches`.

צריך להוסיף את הנתיבים הציבוריים החדשים לרשימת העקיפה ב-`proxy.ts` — אחרת יקבלו 401, בדיוק כמו `/api/v1/` שנוסף שם בספרינט 33.

### שלב 2 — קליטת לידים

**`POST /api/public/leads/:formKey`** — ללא אימות, CORS לפי `allowed_origins` של הטופס, שדה דבש, הגבלת קצב לפי IP, Turnstile אופציונלי. `field_map` ממפה שמות שדות זרים לשדות שלנו, כך שדף נחיתה חיצוני לא מחייב שינוי קוד. מחזיר תמיד 200.

מקורות שנתמכים ביום הראשון:

| מקור | מנגנון |
|---|---|
| דף נחיתה חיצוני (Wix / Framer / Webflow / WordPress) | `POST /api/public/leads/:formKey` |
| דף הנחיתה של Lessio | טופס חדש על `LandingPage.tsx` → אותו endpoint |
| Facebook Lead Ads | Make/n8n → אותו endpoint |
| הזנה ידנית / CSV | `/admin/leads` |

הרחבה מאוחרת: WhatsApp למספר של Lessio עצמה — אותו דפוס `upsertLead` שכבר עובד לארגונים.

### שלב 3 — פיקסלים

`<TrackingScripts />` ב-`src/app/layout.tsx` מרנדר בשרת את היעדים המופעלים מ-`tracking_destinations`, מאחורי באנר הסכמה. הבאנר סוגר את פער התאימות מול מדיניות הפרטיות הקיימת.

`trackEvent()` בצד שרת שולח את אותו אירוע ל-Meta Conversions API ול-GA4 Measurement Protocol עם **אותו `event_id`** של אירוע הדפדפן, כדי ש-Meta תדדופ ולא תספור פעמיים. כישלון נרשם ל-`tracking_events` עם `status = 'failed'` וניסיון חוזר ב-cron.

### שלב 4 — חיבור אירועי ההמרה

כאן נסגרת הלולאה. נקודות החיבור:

| אירוע | איפה |
|---|---|
| `Lead` | `/api/public/leads/:formKey` |
| `CompleteRegistration` | `signUp` ב-`src/app/signup/actions.ts` — כאן גם נקראת עוגיית הייחוס ונכתבת ל-`organizations.attribution` |
| `StartTrial` | יצירת מנוי `trial` |
| `Purchase` (ערך = מחיר התוכנית) | `saas_invoices` שעברה ל-`paid` — כלומר בוובהוק Sumit |

**זה השדרוג המהותי.** `Purchase` שנשלח צד-שרת מהוובהוק פירושו ש-Meta מקבלת את אות ההכנסה האמיתי ולא רק קליק, ויכולה לבצע אופטימיזציה למנוי משלם. וזה גם מה שמאפשר לחשב CAC אמיתי פר קמפיין.

---

## מיילסטונים

| | תוכן | תלוי ב |
|---|---|---|
| **M1** | שלד ופאנל אמיתי: ניווט מקובץ, ראוט `/admin`, פלטת ⌘K, טוקנים, `AdminTable` עם עימוד וייצוא, **מדדי SaaS ב-SQL** (MRR/נטישה/משפך), החלפת שאילתות ה-O(הכל), `/admin/subscriptions`, `/admin/plans`, כרטיס ארגון בלשוניות, `admin_audit_log` | — |
| **M2** | מדידה: עוגיות ייחוס ב-`proxy.ts`, `attribution_touches`, `tracking_destinations` + מסך, `<TrackingScripts />` + באנר הסכמה, Meta CAPI + GA4 MP, חיבור ארבעת אירועי ההמרה | M1 |
| **M3** | CRM: `platform_leads` + אירועים, `/api/public/leads/:formKey`, אינבוקס וצינור, טופס וסקשן תמחור על דף הנחיתה, מיזוג `saas_plan_inquiries`, המרה לארגון, קמפיינים ותקציב, `/admin/attribution` עם CAC ו-LTV | M2 (הייחוס חייב לרוץ לפני שיש מה לייחס) |
| **M4** | עומק תפעולי: `/admin/errors`, `/admin/cost`, `org_feature_overrides`, תגי ספירה, מצבים שמורים | M1 |

M1 עומד בפני עצמו ומספק ערך מיידי. M2 חייב להישלח לפני M3 — ייחוס שמתחיל לרוץ מאוחר מייצר חור בנתונים שאי אפשר להשלים רטרואקטיבית. **מסיבה זו כדאי לשלוח את שלב 1 של M2 (עוגיות הייחוס בלבד, ~חצי יום) יחד עם M1** — הוא לא תלוי בשום דבר ומתחיל לצבור נתונים מיד.

---

## החלטות

| החלטה | למה |
|---|---|
| `platform_leads` נפרדת מ-`leads` | ישויות שונות, קהלים שונים, מחזורי חיים שונים. איחוד היה מכריח `organization_id` להיות nullable בטבלה שכל ה-RLS שלה נשען עליו |
| מזהי פיקסל ב-DB ולא ב-`NEXT_PUBLIC_*` | Next 16 מטמיע אותם ב-build; החלפת פיקסל הייתה מחייבת דיפלוי |
| מדדים ב-SQL, לא ב-JS | הקוד הקיים מושך טבלאות שלמות לזיכרון בכל טעינת עמוד |
| הוצאת קמפיין מוזנת ידנית בהתחלה | Meta Marketing API ו-Google Ads הם אינטגרציה שלמה עם OAuth משלה. CAC ידני היום שווה יותר מ-CAC אוטומטי בעוד חודש |
| Purchase נשלח מוובהוק Sumit ולא מהדפדפן | אירוע הכנסה בדפדפן ניתן לזיוף ואובד עם חוסמי פרסומות. מהשרת הוא אמת |
| `saas_plan_inquiries` מתמזגות ל-CRM | פנייה לתוכנית מותאמת היא ליד לכל דבר. שני אינבוקסים נפרדים פירושם שאחד מהם לא ייקרא |
| שירות ניתוח מוצר (PostHog) נדחה | מדיניות הפרטיות מבטיחה אותו, אבל הוא לא נדרש לסגירת לולאת הפרסום. נכנס דרך אותו רישום `tracking_destinations` כשיוחלט |

---

## מחוץ לסקופ

- בונה דפי נחיתה פנימי. דפי הנחיתה נבנים בכלי חיצוני ושולחים ל-endpoint.
- שליחת מיילים שיווקיים ואוטומציות טיפוח. `sendEmail` קיימת; רצף שיווקי הוא מוצר בפני עצמו.
- משיכה אוטומטית של הוצאות מ-Meta / Google Ads.
- ריבוי סופר-אדמינים והרשאות ביניהם. `admin_audit_log` מכין את הקרקע.
- שינוי כלשהו בדשבורד של הארגון. הספרינט הזה נוגע רק ב-`/admin`, בדף הנחיתה, ובשכבת הייחוס.

---

## הנחות שצריך לאשר

1. **מקורות לידים** — האפיון מניח את ארבעת המקורות בטבלה לעיל, כאשר WhatsApp למספר של Lessio נדחה להרחבה.
2. **יעדי מדידה** — Meta Pixel + CAPI ו-GA4 נבנים ראשונים (מדיניות הפרטיות כבר מבטיחה את שניהם). GTM, Google Ads, TikTok ו-LinkedIn נתמכים ברישום ומופעלים בהגדרה בלבד. PostHog ו-Hotjar נדחים.
3. **מספור** — הספרינט מסומן 34; ספרינט 33 M2/M3 (וובהוקים יוצאים, MCP) עדיין פתוחים ולא נוגעים בזה.
