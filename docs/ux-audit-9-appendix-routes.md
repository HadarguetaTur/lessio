# UX Audit 9 — נספח: טבלת ראוטים

*נגזר אוטומטית מראיות האודיט (`.audit/ux9/sweep-*.json`, 10.09.2026). לא נערך ידנית.*

**מקרא:** CTA = פקד במילוי הצבע הראשי, לא כולל כפתור העזרה הצף (שקיים בכל עמוד ב-3,895px²).
`raw-blue` = מילוי כחול גולמי במקום הטוקן — ראו F27.

## בעלים / אדמין

| ראוט | H1 | שורות | פקדים | CTA ראשי | axe @1440 | @390 |
|---|---|---|---|---|---|---|
| `/dashboard` | לוח הבקרה | 0 | 28 | שיעור חדש | — | נקי |
| `/students` | תלמידים | 18 | 50 | תלמיד חדש | — | S×18 |
| `/students/new` | תלמיד חדש | 0 | 6 | שמור | — | נקי |
| `/students/{studentId}` | נועה לוי | 0 | 11 | **—** | — | נקי |
| `/students/{studentId}/edit` | עריכת תלמיד | 0 | 6 | שמור | — | נקי |
| `/students/{studentId}/parents` | הורים מקושרים — נועה לוי | 1 | 6 | קשר הורה | — | נקי |
| `/students/import` | יבוא תלמידים והורים | 0 | 8 | **—** | — | נקי |
| `/parents` | הורים | 14 | 25 | הורה חדש | — | נקי |
| `/parents/new` | הורה חדש | 0 | 6 | שמור | — | נקי |
| `/parents/{parentId}/edit` | יעל לוי | 0 | 9 | **—** | — | נקי |
| `/parents/import` | יבוא הורים ותלמידים | 0 | 8 | **—** | S/color-contrast×1 | S×1 |
| `/leads` | לידים | 4 | 17 | סנן | C/select-name×4 | C×4 |
| `/teachers` | מורים | 3 | 12 | הזמן מורה | — | נקי |
| `/teachers/new` | הזמן מורה | 0 | 6 | שלח הזמנה | — | נקי |
| `/teachers/{teacherId}/edit` | מיכל אברמוב | 0 | 8 | **—** | S/definition-list×1 | S×1 |
| `/teachers/{teacherId}/availability` | זמינות שבועית — מיכל אברמוב | 0 | 28 | שמור | — | נקי |
| `/teachers/{teacherId}/overrides` | חריגים — מיכל אברמוב | 0 | 11 | חסום שעות + הוסף | — | נקי |
| `/teachers/import` | יבוא מורים | 0 | 6 | **—** | — | נקי |
| `/lessons` | שיעורים | 0 | 42 | שיעור חד פעמי | — | נקי |
| `/lessons/new` | שיעור חד פעמי | 0 | 6 | יצירת שיעור | — | נקי |
| `/lessons/new-series` | סדרת שיעורים | 0 | 5 | יצירת סדרה | — | נקי |
| `/lessons/{lessonId}` | פרטי שיעור | 0 | 9 | עדכן סטטוס + הוסף הערה | — | נקי |
| `/lessons/import` | יבוא שיעורים | 0 | 7 | **—** | — | נקי |
| `/homework` | שיעורי בית | 7 | 20 | + הקצה שיעורי בית | — | נקי |
| `/homework/assign` | הקצה שיעורי בית | 0 | 8 | ידנית + הקצה ושלח (raw-blue) | — | נקי |
| `/homework/{homeworkId}` | אקורדים בסיסיים — Am, C, G | 0 | 4 | **—** | — | נקי |
| `/homework/templates` | תבניות | 0 | 6 | + תבנית חדשה (raw-blue) | — | נקי |
| `/charges` | חיובים | 0 | 14 | סנן | — | נקי |
| `/billing` | חיוב חודשי | 17 | 34 | הפק חיובים + אשר חיוב + אשר חיוב + אשר חיוב | — | נקי |
| `/billing/debts` | גבייה | 0 | 11 | **—** | — | נקי |
| `/subscriptions` | מנויים | 6 | 19 | פעיל | — | נקי |
| `/reports` | דוחות | 0 | 9 | **—** | — | נקי |
| `/reports/revenue` | הכנסות | 12 | 11 | **—** | — | S×1 |
| `/reports/lessons` | שיעורים | 12 | 8 | **—** | — | S×1 |
| `/reports/debt` | יתרות פתוחות | 0 | 11 | **—** | — | נקי |
| `/reports/teachers` | מורים | 3 | 8 | **—** | — | S×1 |
| `/reports/teacher-performance` | ביצועי מורים | 3 | 7 | **—** | — | S×1 |
| `/reports/students` | תלמידים | 18 | 9 | **—** | — | S×1 |
| `/messages` | הודעות פורטל | 0 | 6 | **—** | — | נקי |
| `/messages/whatsapp` | שיחות WhatsApp | 4 | 10 | **—** | — | נקי |
| `/messages/broadcasts` | תפוצות | 0 | 7 | תפוצה חדשה | — | נקי |
| `/messages/broadcasts/new` | תפוצה חדשה | 0 | 6 | עברית + שליחה עכשיו | — | נקי |
| `/support` | הפניות שלי | 0 | 4 | **—** | — | נקי |
| `/support/{ticketId}` | ההודעות לא נשלחות להורה אחד | 0 | 5 | שליחה | — | נקי |
| `/account/billing` | החבילה שלי ב-Lessio | 0 | 9 | שדרג עכשיו + שדרג עכשיו | — | נקי |

## הגדרות

| ראוט | H1 | שורות | פקדים | CTA ראשי | axe @1440 | @390 |
|---|---|---|---|---|---|---|
| `/settings` | העסק | 0 | 14 | **—** | — | — |
| `/settings/business` | העסק | 0 | 14 | **—** | — | — |
| `/settings/billing` | שיעורים וחיוב | 0 | 11 | **—** | — | — |
| `/settings/communications` | תקשורת | 0 | 11 | **—** | — | — |
| `/settings/connections` | חיבורים | 0 | 15 | **—** | — | — |
| `/settings/business-profile` | פרופיל עסקי | 4 | 15 | שמור | — | — |
| `/settings/locale` | שפה ותצוגה | 0 | 12 | **—** | — | — |
| `/settings/scheduling` | לוח זמנים והפסקות | 0 | 9 | שמור (raw-blue) | — | — |
| `/settings/holidays` | חגים וחופשות | 0 | 11 | הוסף (raw-blue) | — | — |
| `/settings/exams` | מדיניות מבחנים | 0 | 9 | שמור (raw-blue) | S/color-contrast×1 | — |
| `/settings/privacy` | פרטיות ושמירת נתונים | 0 | 9 | שמור | — | — |
| `/settings/pricing` | מחירי שיעורים | 0 | 9 | שמור | — | — |
| `/settings/billing-policy` | מדיניות חיוב | 0 | 9 | שמור (raw-blue) | — | — |
| `/settings/cancellation-policy` | מדיניות ביטולים | 0 | 9 | שמירת מדיניות | — | — |
| `/settings/message-templates` | תבניות WhatsApp | 0 | 173 | **—** | — | — |
| `/settings/reminders` | תזכורות | 0 | 11 | שמור (raw-blue) | — | — |
| `/settings/parent-portal` | פורטל הורים | 0 | 10 | שמור (raw-blue) | — | — |
| `/settings/payment` | הגדרות תשלום | 0 | 11 | שמור (raw-blue) | — | — |
| `/settings/receipts` | הגדרות קבלות | 0 | 10 | שמור (raw-blue) | — | — |
| `/settings/whatsapp` | WhatsApp | 0 | 14 | **—** | — | — |
| `/settings/email` | שליחת מייל מהחשבון שלך | 0 | 9 | **—** | — | — |
| `/settings/ai-assistant` | עוזר AI | 0 | 13 | שמור (raw-blue) | — | — |
| `/settings/calendar` | יומן Google ארגוני | 0 | 9 | **—** | — | — |
| `/settings/integrations` | מפתחות API לאוטומציה | 0 | 10 | יצירת מפתח (raw-blue) | — | — |

## מורה

| ראוט | H1 | שורות | פקדים | CTA ראשי | axe @1440 | @390 |
|---|---|---|---|---|---|---|
| `/teacher/dashboard` | דאשבורד | 1 | 6 | שיעור חדש | — | — |
| `/teacher/schedule` | השיעורים שלי | 0 | 23 | שיעור חד פעמי | — | — |
| `/teacher/calendar` | מנוי ליומן | 0 | 5 | **—** | — | — |
| `/teacher/calendar-connect` | היומן שלי ב-Google | 0 | 4 | **—** | — | — |
| `/teacher/new-lesson` | שיעור חדש | 0 | 11 | יצירת שיעור | — | — |
| `/teacher/availability` | הזמינות שלי | 0 | 25 | שמור + הוסף | — | — |
| `/teacher/overrides` | חריגים ביומן | 0 | 8 | חסום שעות + הוסף | — | — |
| `/teacher/reports` | דוחות בקרה | 0 | 5 | **—** | — | — |
| `/teacher/reports/lessons` | שיעורים לפי חודש | 12 | 3 | **—** | — | — |
| `/teacher/reports/students` | נוכחות תלמידים | 6 | 3 | **—** | — | — |
| `/students` | תלמידים | 6 | 10 | **—** | — | — |
| `/parents` | הורים | 14 | 17 | **—** | — | — |
| `/homework` | שיעורי בית | 6 | 15 | + הקצה שיעורי בית | — | — |
| `/messages/whatsapp` | שיחות WhatsApp | 3 | 5 | **—** | — | — |

## פורטל ההורים (390px, הורה מחובר)

| ראוט | H1 | פקדים | axe | גלישה אופקית |
|---|---|---|---|---|
| `/portal/{orgId}/home` | סטודיו מיכל למוזיקה | 11 | נקי | לא |
| `/portal/{orgId}/schedule` | לוח שיעורים | 13 | נקי | לא |
| `/portal/{orgId}/payments` | תשלומים | 8 | נקי | לא |
| `/portal/{orgId}/homework` | שיעורי בית | 8 | נקי | לא |
| `/portal/{orgId}/messages` | הודעות | 9 | נקי | לא |
| `/portal/{orgId}/progress` | התקדמות | 9 | נקי | לא |
| `/portal/{orgId}/exams` | מבחנים | 8 | נקי | לא |
| `/portal/{orgId}/book` | קביעת שיעור | 10 | נקי | לא |

## מצבי ריק (נתפסו לפני ה-seed)

| ראוט | כותרת מצב-הריק |
|---|---|
| `/leads` | אין לידים |
| `/messages/whatsapp` | עוד לא חיברתם מספר WhatsApp |
| `/messages/broadcasts` | עוד לא שלחתם תפוצות |
| `/messages` | אין הודעות |
| `/support` | אין עדיין פניות |
| `/charges` | (היו נתונים — לא ראיה למצב ריק) |
| `/billing/debts` | (היו נתונים — לא ראיה למצב ריק) |
| `/subscriptions` | (היו נתונים — לא ראיה למצב ריק) |
| `/homework/templates` | לא נמצאו תוצאות |
| `/students?tab=groups` | אין קבוצות עדיין |

## ביצועים (dev server, לכן תקרה עליונה)

| ראוט | LCP | CLS | TTFB |
|---|---|---|---|
| `/dashboard` | 1864ms | 0 | 1690ms |
| `/billing` | 1008ms | 0 | 788ms |
| `/students` | 708ms | 0 | 546ms |

---

*ספים: LCP 4000ms · CLS 0.25 · INP 500ms — כולם עברו.*
