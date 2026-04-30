# Sprint 21 — i18n Infrastructure + English

*Status: In Progress*
**Branch:** `sprint-21`
**Depends on:** Sprint 20 complete

**Goal:** Lay multilingual infrastructure before international expansion. Extract all Hebrew dashboard strings to translation keys, add English as the first additional language. Hebrew users see zero visible change. The portal, booking WebView, and WhatsApp messages are out of scope.

---

## Architecture Decisions

**Approach:** `next-intl ^3.x` in **cookie-based locale mode** (no URL-path prefix).
- Dashboard is auth-gated — no SEO value from URL-based routing.
- Locale stored in `locale` cookie (1-year expiry) + `profiles.preferred_locale` DB column (for cross-device persistence).
- On login, the server sets the cookie from `profiles.preferred_locale`.
- `getRequestConfig` reads the cookie; falls back to `'he'`.

**Locales:** `['he', 'en']`, default `'he'`.

**`dir` attribute:** `he` → `dir="rtl"`, `en` → `dir="ltr"`. Switched dynamically in the dashboard layout via `getLocale()` from `next-intl/server`.

**Message key namespaces:**

| Namespace | Contents |
|---|---|
| `common` | Shared labels: actions (save/cancel/delete/edit/add/back), status labels, role labels, day names, empty states |
| `nav` | Sidebar section labels + all nav item labels + logout |
| `dashboard` | Dashboard page: KPI labels, status counters, table headers, today label template |
| `students` | Students CRUD pages + components |
| `parents` | Parents CRUD pages + components |
| `teachers` | Teachers CRUD pages + components |
| `lessons` | Lessons list, new, new-series, detail pages + all lesson components |
| `charges` | Charges list + detail |
| `leads` | Leads list + convert page |
| `homework` | Homework list, templates, assign pages + components |
| `reports` | Reports landing + all 5 report pages |
| `settings` | All settings pages + components |
| `teacherSelf` | Teacher self-service pages: schedule, availability, overrides, calendar, new-lesson |
| `admin` | Admin shell (AdminSidebar, AdminHeader, all admin pages) |

---

## Schema Migration

**File:** `supabase/migrations/20260419000001_profiles_locale.sql`

```sql
ALTER TABLE profiles
  ADD COLUMN preferred_locale text NOT NULL DEFAULT 'he'
    CHECK (preferred_locale IN ('he', 'en'));
```

No RLS change required — profiles already has owner-scoped RLS for reads; service role is used for writes.

---

## Story 0 — Install & Wire next-intl

**New dependency:** `next-intl ^3.x`

### `src/i18n/request.ts` (new)

```typescript
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = (cookieStore.get('locale')?.value ?? 'he') as 'he' | 'en'
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

### `next.config.ts` (update)

Wrap the existing config with `createNextIntlPlugin`:

```typescript
import createNextIntlPlugin from 'next-intl/plugin'
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
export default withNextIntl(nextConfig)
```

### `messages/he.json` + `messages/en.json` (new)

Created as part of Story 2. Placeholder files created here to unblock TypeScript.

### `tsconfig.json` (update if needed)

Ensure `../../messages/*.json` resolves correctly from `src/i18n/request.ts`. Add `"resolveJsonModule": true` if not already present.

**Files changed:**
- `next.config.ts`
- `src/i18n/request.ts` (new)
- `messages/he.json` (new — placeholder, filled in Story 2)
- `messages/en.json` (new — placeholder, filled in Story 2)

---

## Story 1 — Schema + LocaleSwitcher + Locale Cookie on Login

### Migration

Run migration `20260419000001_profiles_locale.sql`.

### `src/app/(dashboard)/settings/locale/actions.ts` (new)

```typescript
'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'

const schema = z.object({ locale: z.enum(['he', 'en']) })

export async function saveLocaleAction(formData: FormData) {
  const session = await getSession()
  requireMutation(session)
  const { locale } = schema.parse({ locale: formData.get('locale') })

  const db = createServiceRoleClient()
  await db.from('profiles').update({ preferred_locale: locale }).eq('id', session.profileId)

  const cookieStore = await cookies()
  cookieStore.set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: false, sameSite: 'lax' })

  revalidatePath('/', 'layout')
}
```

### `src/components/dashboard/LocaleSwitcher.tsx` (new)

Client component in the dashboard header area (placed in `DashboardLayout` next to the `<main>` element, or at the bottom of the Sidebar).

```typescript
'use client'
import { useTransition } from 'react'
import { saveLocaleAction } from '@/app/(dashboard)/settings/locale/actions'

interface Props { currentLocale: string }

export function LocaleSwitcher({ currentLocale }: Props) {
  const [isPending, startTransition] = useTransition()
  const next = currentLocale === 'he' ? 'en' : 'he'
  const label = currentLocale === 'he' ? 'English' : 'עברית'

  return (
    <form action={(fd) => startTransition(() => saveLocaleAction(fd))}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
      >
        {label}
      </button>
    </form>
  )
}
```

Place `<LocaleSwitcher currentLocale={locale} />` in the Sidebar footer (below the logout button), passing the locale resolved server-side via `getLocale()` from `next-intl/server`.

### Cookie on login

`src/app/(auth)/login/actions.ts` (or wherever sign-in completes) — after successful sign-in, read `profiles.preferred_locale` and set the `locale` cookie. This ensures the locale is correct immediately on first load after login across devices.

### Layout `dir` update — `src/app/(dashboard)/layout.tsx`

```typescript
import { getLocale } from 'next-intl/server'
// ...
const locale = await getLocale()
// Replace hardcoded dir="rtl" with:
<div className="flex min-h-screen bg-gray-50" dir={locale === 'he' ? 'rtl' : 'ltr'}>
```

Apply the same fix to the support-mode branch in the same file.

**Files changed:**
- `supabase/migrations/20260419000001_profiles_locale.sql` (new)
- `src/app/(dashboard)/settings/locale/actions.ts` (new)
- `src/components/dashboard/LocaleSwitcher.tsx` (new)
- `src/app/(dashboard)/layout.tsx`
- `src/app/(auth)/login/actions.ts` (or equivalent sign-in completion handler)

---

## Story 2 — Extract Strings → messages/he.json + messages/en.json

This is the largest story. All Hebrew UI strings are extracted to `messages/he.json` with matching English in `messages/en.json`. The full key structure is defined below.

### Naming conventions

- Keys are `camelCase`.
- Variables use ICU syntax: `{count}`, `{name}`, `{amount}`.
- Status keys match DB enum values directly for easy lookup: `STATUS_LABELS[status]` → `t('common.status.' + status)`.

### messages/he.json top-level structure

```json
{
  "common": {
    "actions": {
      "save": "שמור",
      "cancel": "ביטול",
      "delete": "מחק",
      "edit": "עריכה",
      "add": "הוסף",
      "back": "חזרה",
      "search": "חפש",
      "confirm": "אשר",
      "send": "שלח",
      "close": "סגור",
      "copy": "העתק",
      "copied": "הועתק!",
      "disconnect": "נתק",
      "connect": "חבר",
      "export": "ייצוא CSV",
      "refresh": "רענן"
    },
    "status": {
      "scheduled": "מתוכנן",
      "completed": "הושלם",
      "cancelled": "בוטל",
      "no_show": "לא הגיע"
    },
    "chargeStatus": {
      "pending": "ממתין",
      "invoiced": "חויב",
      "paid": "שולם"
    },
    "homeworkStatus": {
      "pending": "ממתין",
      "done": "הושלם",
      "overdue": "באיחור"
    },
    "leadStatus": {
      "new": "חדש",
      "contacted": "במעקב",
      "converted": "מומר",
      "closed": "סגור"
    },
    "roles": {
      "owner": "בעלים",
      "admin": "מנהל",
      "teacher": "מורה"
    },
    "days": {
      "sun": "ראשון",
      "mon": "שני",
      "tue": "שלישי",
      "wed": "רביעי",
      "thu": "חמישי",
      "fri": "שישי",
      "sat": "שבת"
    },
    "months": {
      "1": "ינואר", "2": "פברואר", "3": "מרץ", "4": "אפריל",
      "5": "מאי", "6": "יוני", "7": "יולי", "8": "אוגוסט",
      "9": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר"
    },
    "durations": {
      "30": "30 דקות",
      "45": "45 דקות",
      "60": "60 דקות",
      "75": "75 דקות",
      "90": "90 דקות",
      "120": "120 דקות"
    },
    "emptyStates": {
      "noResults": "לא נמצאו תוצאות",
      "noLessonsToday": "אין שיעורים מתוכננים להיום"
    },
    "table": {
      "time": "שעה",
      "student": "תלמיד",
      "teacher": "מורה",
      "status": "סטטוס",
      "date": "תאריך",
      "amount": "סכום",
      "name": "שם",
      "phone": "טלפון",
      "actions": "פעולות"
    },
    "errors": {
      "unexpected": "אירעה שגיאה. נסה שוב.",
      "required": "שדה חובה"
    },
    "logout": "יציאה"
  },
  "nav": {
    "sections": {
      "management": "ניהול",
      "reports": "דוחות",
      "settings": "הגדרות"
    },
    "dashboard": "לוח הבקרה",
    "students": "תלמידים",
    "parents": "הורים",
    "teachers": "מורים",
    "lessons": "שיעורים",
    "charges": "חיובים",
    "leads": "לידים",
    "homework": "שיעורי בית",
    "reportsRevenue": "הכנסות",
    "reportsLessons": "שיעורים",
    "reportsDebt": "חובות",
    "reportsTeachers": "מורים",
    "reportsStudents": "תלמידים",
    "settingsWhatsApp": "WhatsApp",
    "settingsMessages": "הודעות",
    "settingsPayment": "תשלומים",
    "settingsReceipts": "קבלות",
    "settingsCancellation": "מדיניות ביטולים",
    "settingsHolidays": "חגים וחופשות",
    "settingsReminders": "תזכורות",
    "settingsAiAssistant": "עוזר AI",
    "teacherSchedule": "השיעורים שלי",
    "teacherCalendar": "מנוי ליומן",
    "teacherNewLesson": "שיעור חדש",
    "teacherAvailability": "הזמינות שלי",
    "teacherOverrides": "חריגים ביומן"
  },
  "dashboard": {
    "title": "לוח הבקרה",
    "todayLabel": "יום {weekday}, {day} ב{month}",
    "kpi": {
      "monthlyRevenue": "הכנסה החודש",
      "pendingDebt": "חוב פתוח",
      "lessonsThisMonth": "שיעורים החודש",
      "activeStudents": "תלמידים פעילים",
      "cancellationRate": "שיעורים שבוטלו",
      "atRiskStudents": "תלמידים בסיכון",
      "newLeads": "לידים חדשים החודש"
    },
    "todayStatus": "סטטוס היום",
    "todayLessons": "שיעורים — היום",
    "statusCounters": {
      "total": "סה״כ",
      "scheduled": "מתוכננים",
      "completed": "הושלמו",
      "noShow": "לא הגיע",
      "cancelled": "בוטלו"
    }
  },
  "students": {
    "title": "תלמידים",
    "newStudent": "תלמיד חדש",
    "editStudent": "עריכת תלמיד",
    "fields": {
      "fullName": "שם מלא",
      "phone": "טלפון",
      "email": "אימייל",
      "grade": "כיתה",
      "notes": "הערות"
    },
    "parents": {
      "title": "הורים מקושרים",
      "link": "קשר הורה",
      "unlink": "הסר קישור",
      "isPrimary": "הורה ראשי",
      "noParents": "אין הורים מקושרים"
    },
    "deleteConfirm": "למחוק את התלמיד?",
    "saved": "התלמיד נשמר בהצלחה"
  },
  "parents": {
    "title": "הורים",
    "newParent": "הורה חדש",
    "editParent": "עריכת הורה",
    "fields": {
      "fullName": "שם מלא",
      "phone": "טלפון",
      "email": "אימייל",
      "notes": "הערות"
    },
    "balance": "יתרת חוב",
    "sendPaymentRequest": "שלח בקשת תשלום",
    "paymentSent": "בקשת התשלום נשלחה",
    "deleteConfirm": "למחוק את ההורה?",
    "saved": "ההורה נשמר בהצלחה"
  },
  "teachers": {
    "title": "מורים",
    "newTeacher": "מורה חדש",
    "editTeacher": "עריכת מורה",
    "invite": "הזמן מורה",
    "inviteDescription": "הזמנה תישלח למייל",
    "fields": {
      "fullName": "שם מלא",
      "phone": "טלפון",
      "email": "אימייל",
      "hourlyRate": "תעריף לשעה (₪)",
      "subjects": "מקצועות"
    },
    "availability": "זמינות שבועית",
    "overrides": "חריגים",
    "deleteConfirm": "למחוק את המורה?",
    "saved": "המורה נשמר בהצלחה",
    "invited": "ההזמנה נשלחה בהצלחה"
  },
  "lessons": {
    "title": "שיעורים",
    "newLesson": "שיעור חד פעמי",
    "newSeries": "שיעורים קבועים",
    "newLessonTitle": "שיעור חדש",
    "newSeriesTitle": "סדרת שיעורים",
    "fields": {
      "teacher": "מורה",
      "student": "תלמיד",
      "date": "תאריך",
      "time": "שעת התחלה",
      "duration": "משך",
      "dayOfWeek": "יום בשבוע",
      "startDate": "תאריך התחלה",
      "endDate": "תאריך סיום",
      "notes": "הערות",
      "outcome": "תוצאת שיעור"
    },
    "series": {
      "badge": "סדרה",
      "cancelFromHere": "בטל מכאן ואילך",
      "cancelAll": "בטל את כל הסדרה",
      "createdSummary": "הסדרה נוצרה בהצלחה",
      "skippedDates": "תאריכים שדולגו (חפיפה / חג)"
    },
    "cancel": {
      "title": "ביטול שיעור",
      "reason": "סיבת ביטול",
      "confirm": "אשר ביטול"
    },
    "statusUpdate": "עדכון סטטוס",
    "conflict": "קיימת חפיפה בשיעורים",
    "holiday": "תאריך זה הוא חג / חופשה",
    "noLessons": "אין שיעורים בשבוע זה",
    "today": "היום"
  },
  "charges": {
    "title": "חיובים",
    "types": {
      "lesson": "שיעור",
      "cancellation": "ביטול",
      "manual": "ידני"
    },
    "fields": {
      "parent": "הורה",
      "amount": "סכום",
      "description": "תיאור",
      "status": "סטטוס",
      "paidAt": "תאריך תשלום",
      "note": "הערה",
      "receiptUrl": "קבלה"
    },
    "markAsPaid": "סמן כשולם",
    "markAsPaidConfirm": "לסמן את החיוב כשולם?",
    "agingSummary": {
      "pending": "ממתין",
      "invoiced": "חויב",
      "paidThisMonth": "שולם החודש"
    },
    "noCharges": "אין חיובים"
  },
  "leads": {
    "title": "לידים",
    "fields": {
      "name": "שם",
      "phone": "טלפון",
      "source": "מקור",
      "status": "סטטוס",
      "notes": "הערות"
    },
    "convert": "המר ליד",
    "convertTitle": "המרת ליד ללקוח",
    "convertDescription": "יצירת תלמיד והורה מהליד",
    "converted": "הליד הומר בהצלחה",
    "noLeads": "אין לידים"
  },
  "homework": {
    "title": "שיעורי בית",
    "templates": "תבניות",
    "newTemplate": "תבנית חדשה",
    "editTemplate": "עריכת תבנית",
    "assign": "הקצה שיעורי בית",
    "fields": {
      "title": "כותרת",
      "subject": "מקצוע",
      "body": "תוכן",
      "student": "תלמיד",
      "template": "תבנית",
      "dueDate": "תאריך הגשה"
    },
    "deleteTemplateConfirm": "למחוק את התבנית?",
    "assigned": "שיעורי הבית הוקצו בהצלחה",
    "noAssignments": "אין שיעורי בית"
  },
  "reports": {
    "title": "דוחות",
    "description": "ניתוח נתוני פעילות הארגון",
    "downloadCsv": "ייצוא CSV",
    "period": "תקופה",
    "months": "{count} חודשים",
    "revenue": {
      "title": "הכנסות",
      "description": "הכנסות לפי חודש",
      "month": "חודש",
      "revenue": "הכנסות (₪)",
      "count": "מספר שיעורים"
    },
    "lessons": {
      "title": "שיעורים",
      "description": "שיעורים שנלמדו מול שיעורים שבוטלו",
      "completed": "הושלמו",
      "cancelled": "בוטלו"
    },
    "debt": {
      "title": "חובות",
      "description": "הורים עם יתרת חוב",
      "parent": "הורה",
      "balance": "יתרת חוב"
    },
    "teachers": {
      "title": "מורים",
      "description": "פעילות לפי מורה",
      "lessons": "שיעורים",
      "revenue": "הכנסות"
    },
    "students": {
      "title": "תלמידים",
      "description": "פעילות תלמידים וסיכוני נשירה",
      "atRisk": "תלמידים בסיכון",
      "atRiskDescription": "תלמידים שלא היה להם שיעור ב-14 הימים האחרונים",
      "lastLesson": "שיעור אחרון",
      "totalLessons": "סה״כ שיעורים"
    }
  },
  "settings": {
    "title": "הגדרות",
    "cards": {
      "whatsapp": { "title": "WhatsApp", "description": "חיבור מספר WhatsApp לארגון" },
      "messages": { "title": "הודעות WhatsApp", "description": "התאמה אישית של הודעות אוטומטיות" },
      "payment": { "title": "תשלומים", "description": "ספק תשלומים ובקשות תשלום" },
      "receipts": { "title": "קבלות", "description": "הפקת קבלות אוטומטיות" },
      "cancellation": { "title": "מדיניות ביטולים", "description": "כללי חיוב על ביטול" },
      "holidays": { "title": "חגים וחופשות", "description": "ימים שאין בהם שיעורים" },
      "reminders": { "title": "תזכורות", "description": "הגדרות תזכורות אוטומטיות" },
      "aiAssistant": { "title": "עוזר AI", "description": "עוזר WhatsApp חכם לתשובות אוטומטיות" }
    },
    "whatsapp": {
      "title": "WhatsApp",
      "connected": "מחובר",
      "notConnected": "לא מחובר",
      "connect": "חבר מספר WhatsApp",
      "disconnect": "נתק",
      "disconnectConfirm": "לנתק את WhatsApp?",
      "portalUrl": "קישור פורטל הורים",
      "copyPortalUrl": "העתק קישור"
    },
    "payment": {
      "title": "הגדרות תשלום",
      "provider": "ספק תשלומים",
      "autoSend": "שלח בקשת תשלום אוטומטית לאחר שיעור",
      "disconnect": "נתק ספק",
      "disconnectConfirm": "לנתק את ספק התשלומים?"
    },
    "receipts": {
      "title": "הגדרות קבלות",
      "provider": "Green Invoice",
      "apiKey": "מפתח API",
      "connected": "מחובר",
      "disconnect": "נתק",
      "disconnectConfirm": "לנתק את ספק הקבלות?"
    },
    "cancellationPolicy": {
      "title": "מדיניות ביטולים",
      "chargeType": "סוג חיוב",
      "percentage": "אחוז מהשיעור",
      "fixed": "סכום קבוע",
      "hours": "שעות מינימום לביטול ללא קנס"
    },
    "holidays": {
      "title": "חגים וחופשות",
      "addHoliday": "הוסף חג",
      "fields": {
        "name": "שם",
        "date": "תאריך",
        "endDate": "תאריך סיום (רשות)"
      },
      "deleteConfirm": "למחוק את החג?",
      "noHolidays": "אין חגים מוגדרים"
    },
    "reminders": {
      "title": "תזכורות",
      "lessonReminder": "תזכורת לפני שיעור",
      "paymentReminder": "תזכורת לחוב פתוח",
      "hoursBeforeLesson": "שעות לפני שיעור",
      "daysAfterInvoice": "ימים לאחר חיוב",
      "notificationLog": "יומן התראות",
      "logHeaders": {
        "type": "סוג",
        "recipient": "נמען",
        "sentAt": "נשלח ב"
      },
      "noLog": "אין רשומות"
    },
    "messageTemplates": {
      "title": "התאמה אישית של הודעות",
      "preview": "תצוגה מקדימה",
      "variables": "משתנים זמינים",
      "reset": "אפס לברירת מחדל",
      "saved": "התבנית נשמרה"
    },
    "aiAssistant": {
      "title": "עוזר AI",
      "enable": "הפעל עוזר AI",
      "enabled": "פעיל",
      "disabled": "כבוי",
      "keyMissingWarning": "AI מופעל אך מפתח OPENAI_API_KEY לא מוגדר בשרת. פנה למנהל המערכת.",
      "conversationLog": "יומן שיחות",
      "logHeaders": {
        "time": "שעה",
        "phone": "טלפון",
        "parentMessage": "הודעת הורה",
        "aiReply": "תשובת AI"
      },
      "noLog": "אין שיחות מתועדות"
    }
  },
  "teacherSelf": {
    "schedule": {
      "title": "השיעורים שלי",
      "noLessons": "אין שיעורים בשבוע זה"
    },
    "availability": {
      "title": "הזמינות שלי",
      "addSlot": "הוסף זמינות",
      "noSlots": "לא הוגדרה זמינות"
    },
    "overrides": {
      "title": "חריגים ביומן",
      "addOverride": "הוסף חריג",
      "typeBlocked": "חסום",
      "typeAvailable": "זמין"
    },
    "newLesson": {
      "title": "שיעור חדש"
    },
    "calendar": {
      "title": "מנוי ליומן",
      "description": "הוסף את שיעוריך ליומן Google, Apple או Outlook",
      "subscriptionUrl": "קישור מנוי",
      "copyLink": "העתק קישור",
      "regenerate": "החדש טוקן",
      "regenerateConfirm": "קישור קיים יפסיק לפעול. להמשיך?",
      "googleInstructions": "Google Calendar: לחץ + לצד 'לוחות שנה אחרים' ← 'כתובת URL'",
      "appleInstructions": "Apple Calendar: קובץ ← מנוי על לוח שנה",
      "outlookInstructions": "Outlook: הוסף לוח שנה ← מ-אינטרנט"
    }
  },
  "admin": {
    "nav": {
      "title": "LESSIO Admin",
      "dashboard": "לוח בקרה",
      "orgs": "ארגונים",
      "billing": "בילינג"
    },
    "dashboard": {
      "title": "לוח בקרה — פלטפורמה",
      "kpi": {
        "totalOrgs": "ארגונים",
        "activeOrgs": "ארגונים פעילים",
        "totalRevenue": "הכנסות"
      },
      "needsSetup": "ארגונים שדורשים הגדרה",
      "recentOrgs": "ארגונים אחרונים"
    },
    "orgs": {
      "title": "ארגונים",
      "newOrg": "ארגון חדש",
      "fields": {
        "name": "שם הארגון",
        "ownerName": "שם בעלים",
        "ownerEmail": "אימייל בעלים",
        "phone": "מספר WhatsApp"
      },
      "filters": {
        "search": "חיפוש",
        "status": "סטטוס",
        "missingSetup": "חסר הגדרה"
      },
      "status": {
        "active": "פעיל",
        "needs_setup": "בהגדרה",
        "inactive": "לא פעיל"
      },
      "startSupport": "כנס למצב תמיכה",
      "exitSupport": "צא ממצב תמיכה"
    },
    "billing": {
      "title": "בילינג",
      "headers": {
        "org": "ארגון",
        "paymentProvider": "ספק תשלומים",
        "receipts": "קבלות",
        "revenue": "הכנסות"
      }
    },
    "supportBanner": "מצב תמיכה: {orgName} — {timeRemaining} דקות נותרו"
  }
}
```

### messages/en.json — complete English translation

```json
{
  "common": {
    "actions": {
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit",
      "add": "Add",
      "back": "Back",
      "search": "Search",
      "confirm": "Confirm",
      "send": "Send",
      "close": "Close",
      "copy": "Copy",
      "copied": "Copied!",
      "disconnect": "Disconnect",
      "connect": "Connect",
      "export": "Export CSV",
      "refresh": "Refresh"
    },
    "status": {
      "scheduled": "Scheduled",
      "completed": "Completed",
      "cancelled": "Cancelled",
      "no_show": "No Show"
    },
    "chargeStatus": {
      "pending": "Pending",
      "invoiced": "Invoiced",
      "paid": "Paid"
    },
    "homeworkStatus": {
      "pending": "Pending",
      "done": "Done",
      "overdue": "Overdue"
    },
    "leadStatus": {
      "new": "New",
      "contacted": "Contacted",
      "converted": "Converted",
      "closed": "Closed"
    },
    "roles": {
      "owner": "Owner",
      "admin": "Admin",
      "teacher": "Teacher"
    },
    "days": {
      "sun": "Sunday",
      "mon": "Monday",
      "tue": "Tuesday",
      "wed": "Wednesday",
      "thu": "Thursday",
      "fri": "Friday",
      "sat": "Saturday"
    },
    "months": {
      "1": "January", "2": "February", "3": "March", "4": "April",
      "5": "May", "6": "June", "7": "July", "8": "August",
      "9": "September", "10": "October", "11": "November", "12": "December"
    },
    "durations": {
      "30": "30 minutes",
      "45": "45 minutes",
      "60": "60 minutes",
      "75": "75 minutes",
      "90": "90 minutes",
      "120": "120 minutes"
    },
    "emptyStates": {
      "noResults": "No results found",
      "noLessonsToday": "No lessons scheduled for today"
    },
    "table": {
      "time": "Time",
      "student": "Student",
      "teacher": "Teacher",
      "status": "Status",
      "date": "Date",
      "amount": "Amount",
      "name": "Name",
      "phone": "Phone",
      "actions": "Actions"
    },
    "errors": {
      "unexpected": "An error occurred. Please try again.",
      "required": "Required"
    },
    "logout": "Sign out"
  },
  "nav": {
    "sections": {
      "management": "Management",
      "reports": "Reports",
      "settings": "Settings"
    },
    "dashboard": "Dashboard",
    "students": "Students",
    "parents": "Parents",
    "teachers": "Teachers",
    "lessons": "Lessons",
    "charges": "Charges",
    "leads": "Leads",
    "homework": "Homework",
    "reportsRevenue": "Revenue",
    "reportsLessons": "Lessons",
    "reportsDebt": "Debt",
    "reportsTeachers": "Teachers",
    "reportsStudents": "Students",
    "settingsWhatsApp": "WhatsApp",
    "settingsMessages": "Messages",
    "settingsPayment": "Payments",
    "settingsReceipts": "Receipts",
    "settingsCancellation": "Cancellation Policy",
    "settingsHolidays": "Holidays",
    "settingsReminders": "Reminders",
    "settingsAiAssistant": "AI Assistant",
    "teacherSchedule": "My Lessons",
    "teacherCalendar": "Calendar Feed",
    "teacherNewLesson": "New Lesson",
    "teacherAvailability": "My Availability",
    "teacherOverrides": "Schedule Exceptions"
  },
  "dashboard": {
    "title": "Dashboard",
    "todayLabel": "{weekday}, {month} {day}",
    "kpi": {
      "monthlyRevenue": "Revenue This Month",
      "pendingDebt": "Outstanding Debt",
      "lessonsThisMonth": "Lessons This Month",
      "activeStudents": "Active Students",
      "cancellationRate": "Cancellation Rate",
      "atRiskStudents": "At-Risk Students",
      "newLeads": "New Leads This Month"
    },
    "todayStatus": "Today's Status",
    "todayLessons": "Today's Lessons",
    "statusCounters": {
      "total": "Total",
      "scheduled": "Scheduled",
      "completed": "Completed",
      "noShow": "No Show",
      "cancelled": "Cancelled"
    }
  },
  "students": {
    "title": "Students",
    "newStudent": "New Student",
    "editStudent": "Edit Student",
    "fields": {
      "fullName": "Full Name",
      "phone": "Phone",
      "email": "Email",
      "grade": "Grade",
      "notes": "Notes"
    },
    "parents": {
      "title": "Linked Parents",
      "link": "Link Parent",
      "unlink": "Unlink",
      "isPrimary": "Primary Parent",
      "noParents": "No parents linked"
    },
    "deleteConfirm": "Delete this student?",
    "saved": "Student saved successfully"
  },
  "parents": {
    "title": "Parents",
    "newParent": "New Parent",
    "editParent": "Edit Parent",
    "fields": {
      "fullName": "Full Name",
      "phone": "Phone",
      "email": "Email",
      "notes": "Notes"
    },
    "balance": "Outstanding Balance",
    "sendPaymentRequest": "Send Payment Request",
    "paymentSent": "Payment request sent",
    "deleteConfirm": "Delete this parent?",
    "saved": "Parent saved successfully"
  },
  "teachers": {
    "title": "Teachers",
    "newTeacher": "New Teacher",
    "editTeacher": "Edit Teacher",
    "invite": "Invite Teacher",
    "inviteDescription": "An invitation will be sent by email",
    "fields": {
      "fullName": "Full Name",
      "phone": "Phone",
      "email": "Email",
      "hourlyRate": "Hourly Rate (₪)",
      "subjects": "Subjects"
    },
    "availability": "Weekly Availability",
    "overrides": "Schedule Exceptions",
    "deleteConfirm": "Delete this teacher?",
    "saved": "Teacher saved successfully",
    "invited": "Invitation sent successfully"
  },
  "lessons": {
    "title": "Lessons",
    "newLesson": "Single Lesson",
    "newSeries": "Recurring Lessons",
    "newLessonTitle": "New Lesson",
    "newSeriesTitle": "Lesson Series",
    "fields": {
      "teacher": "Teacher",
      "student": "Student",
      "date": "Date",
      "time": "Start Time",
      "duration": "Duration",
      "dayOfWeek": "Day of Week",
      "startDate": "Start Date",
      "endDate": "End Date",
      "notes": "Notes",
      "outcome": "Lesson Outcome"
    },
    "series": {
      "badge": "Series",
      "cancelFromHere": "Cancel From Here",
      "cancelAll": "Cancel Entire Series",
      "createdSummary": "Series created successfully",
      "skippedDates": "Skipped dates (conflict or holiday)"
    },
    "cancel": {
      "title": "Cancel Lesson",
      "reason": "Reason",
      "confirm": "Confirm Cancellation"
    },
    "statusUpdate": "Update Status",
    "conflict": "Schedule conflict detected",
    "holiday": "This date is a holiday",
    "noLessons": "No lessons this week",
    "today": "Today"
  },
  "charges": {
    "title": "Charges",
    "types": {
      "lesson": "Lesson",
      "cancellation": "Cancellation",
      "manual": "Manual"
    },
    "fields": {
      "parent": "Parent",
      "amount": "Amount",
      "description": "Description",
      "status": "Status",
      "paidAt": "Paid At",
      "note": "Note",
      "receiptUrl": "Receipt"
    },
    "markAsPaid": "Mark as Paid",
    "markAsPaidConfirm": "Mark this charge as paid?",
    "agingSummary": {
      "pending": "Pending",
      "invoiced": "Invoiced",
      "paidThisMonth": "Paid This Month"
    },
    "noCharges": "No charges"
  },
  "leads": {
    "title": "Leads",
    "fields": {
      "name": "Name",
      "phone": "Phone",
      "source": "Source",
      "status": "Status",
      "notes": "Notes"
    },
    "convert": "Convert Lead",
    "convertTitle": "Convert Lead to Customer",
    "convertDescription": "Create a student and parent from this lead",
    "converted": "Lead converted successfully",
    "noLeads": "No leads"
  },
  "homework": {
    "title": "Homework",
    "templates": "Templates",
    "newTemplate": "New Template",
    "editTemplate": "Edit Template",
    "assign": "Assign Homework",
    "fields": {
      "title": "Title",
      "subject": "Subject",
      "body": "Content",
      "student": "Student",
      "template": "Template",
      "dueDate": "Due Date"
    },
    "deleteTemplateConfirm": "Delete this template?",
    "assigned": "Homework assigned successfully",
    "noAssignments": "No homework assignments"
  },
  "reports": {
    "title": "Reports",
    "description": "Organization activity analytics",
    "downloadCsv": "Export CSV",
    "period": "Period",
    "months": "{count} months",
    "revenue": {
      "title": "Revenue",
      "description": "Revenue by month",
      "month": "Month",
      "revenue": "Revenue (₪)",
      "count": "Lesson Count"
    },
    "lessons": {
      "title": "Lessons",
      "description": "Lessons taught vs cancelled",
      "completed": "Completed",
      "cancelled": "Cancelled"
    },
    "debt": {
      "title": "Debt",
      "description": "Parents with outstanding balances",
      "parent": "Parent",
      "balance": "Balance"
    },
    "teachers": {
      "title": "Teachers",
      "description": "Activity by teacher",
      "lessons": "Lessons",
      "revenue": "Revenue"
    },
    "students": {
      "title": "Students",
      "description": "Student activity and churn risk",
      "atRisk": "At-Risk Students",
      "atRiskDescription": "Students with no lesson in the last 14 days",
      "lastLesson": "Last Lesson",
      "totalLessons": "Total Lessons"
    }
  },
  "settings": {
    "title": "Settings",
    "cards": {
      "whatsapp": { "title": "WhatsApp", "description": "Connect a WhatsApp number to your organization" },
      "messages": { "title": "WhatsApp Messages", "description": "Customize automated messages" },
      "payment": { "title": "Payments", "description": "Payment provider and payment requests" },
      "receipts": { "title": "Receipts", "description": "Automatic receipt generation" },
      "cancellation": { "title": "Cancellation Policy", "description": "Cancellation charge rules" },
      "holidays": { "title": "Holidays", "description": "Days with no lessons" },
      "reminders": { "title": "Reminders", "description": "Automated reminder settings" },
      "aiAssistant": { "title": "AI Assistant", "description": "Smart WhatsApp assistant for automatic replies" }
    },
    "whatsapp": {
      "title": "WhatsApp",
      "connected": "Connected",
      "notConnected": "Not Connected",
      "connect": "Connect WhatsApp Number",
      "disconnect": "Disconnect",
      "disconnectConfirm": "Disconnect WhatsApp?",
      "portalUrl": "Parent Portal Link",
      "copyPortalUrl": "Copy Link"
    },
    "payment": {
      "title": "Payment Settings",
      "provider": "Payment Provider",
      "autoSend": "Automatically send payment request after lesson",
      "disconnect": "Disconnect Provider",
      "disconnectConfirm": "Disconnect the payment provider?"
    },
    "receipts": {
      "title": "Receipt Settings",
      "provider": "Green Invoice",
      "apiKey": "API Key",
      "connected": "Connected",
      "disconnect": "Disconnect",
      "disconnectConfirm": "Disconnect the receipt provider?"
    },
    "cancellationPolicy": {
      "title": "Cancellation Policy",
      "chargeType": "Charge Type",
      "percentage": "Percentage of lesson",
      "fixed": "Fixed amount",
      "hours": "Minimum hours for penalty-free cancellation"
    },
    "holidays": {
      "title": "Holidays",
      "addHoliday": "Add Holiday",
      "fields": {
        "name": "Name",
        "date": "Date",
        "endDate": "End Date (optional)"
      },
      "deleteConfirm": "Delete this holiday?",
      "noHolidays": "No holidays defined"
    },
    "reminders": {
      "title": "Reminders",
      "lessonReminder": "Lesson reminder",
      "paymentReminder": "Payment debt reminder",
      "hoursBeforeLesson": "Hours before lesson",
      "daysAfterInvoice": "Days after invoice",
      "notificationLog": "Notification Log",
      "logHeaders": {
        "type": "Type",
        "recipient": "Recipient",
        "sentAt": "Sent At"
      },
      "noLog": "No entries"
    },
    "messageTemplates": {
      "title": "Customize Messages",
      "preview": "Preview",
      "variables": "Available Variables",
      "reset": "Reset to Default",
      "saved": "Template saved"
    },
    "aiAssistant": {
      "title": "AI Assistant",
      "enable": "Enable AI Assistant",
      "enabled": "Active",
      "disabled": "Off",
      "keyMissingWarning": "AI is enabled but OPENAI_API_KEY is not configured on this server. Contact the platform administrator.",
      "conversationLog": "Conversation Log",
      "logHeaders": {
        "time": "Time",
        "phone": "Phone",
        "parentMessage": "Parent Message",
        "aiReply": "AI Reply"
      },
      "noLog": "No conversations recorded"
    }
  },
  "teacherSelf": {
    "schedule": {
      "title": "My Lessons",
      "noLessons": "No lessons this week"
    },
    "availability": {
      "title": "My Availability",
      "addSlot": "Add Availability",
      "noSlots": "No availability defined"
    },
    "overrides": {
      "title": "Schedule Exceptions",
      "addOverride": "Add Exception",
      "typeBlocked": "Blocked",
      "typeAvailable": "Available"
    },
    "newLesson": {
      "title": "New Lesson"
    },
    "calendar": {
      "title": "Calendar Feed",
      "description": "Add your lessons to Google, Apple, or Outlook Calendar",
      "subscriptionUrl": "Subscription Link",
      "copyLink": "Copy Link",
      "regenerate": "Regenerate Token",
      "regenerateConfirm": "The existing link will stop working. Continue?",
      "googleInstructions": "Google Calendar: Click + next to 'Other calendars' → 'From URL'",
      "appleInstructions": "Apple Calendar: File → New Calendar Subscription",
      "outlookInstructions": "Outlook: Add Calendar → From Internet"
    }
  },
  "admin": {
    "nav": {
      "title": "LESSIO Admin",
      "dashboard": "Dashboard",
      "orgs": "Organizations",
      "billing": "Billing"
    },
    "dashboard": {
      "title": "Platform Dashboard",
      "kpi": {
        "totalOrgs": "Organizations",
        "activeOrgs": "Active Orgs",
        "totalRevenue": "Revenue"
      },
      "needsSetup": "Orgs Needing Setup",
      "recentOrgs": "Recent Organizations"
    },
    "orgs": {
      "title": "Organizations",
      "newOrg": "New Organization",
      "fields": {
        "name": "Organization Name",
        "ownerName": "Owner Name",
        "ownerEmail": "Owner Email",
        "phone": "WhatsApp Number"
      },
      "filters": {
        "search": "Search",
        "status": "Status",
        "missingSetup": "Missing Setup"
      },
      "status": {
        "active": "Active",
        "needs_setup": "Needs Setup",
        "inactive": "Inactive"
      },
      "startSupport": "Enter Support Mode",
      "exitSupport": "Exit Support Mode"
    },
    "billing": {
      "title": "Billing",
      "headers": {
        "org": "Organization",
        "paymentProvider": "Payment Provider",
        "receipts": "Receipts",
        "revenue": "Revenue"
      }
    },
    "supportBanner": "Support Mode: {orgName} — {timeRemaining} minutes remaining"
  }
}
```

**Files changed:**
- `messages/he.json` (new)
- `messages/en.json` (new)

---

## Story 3 — Wire useTranslations into Dashboard Pages + Components

Replace every hardcoded Hebrew string with `t('key')`. Apply to all dashboard pages and components identified in Story 2.

### Patterns

**Server Component:**
```typescript
import { getTranslations } from 'next-intl/server'

export default async function StudentsPage() {
  const t = await getTranslations('students')
  // ...
  return <h1>{t('title')}</h1>
}
```

**Client Component:**
```typescript
'use client'
import { useTranslations } from 'next-intl'

export function LessonStatusForm() {
  const t = useTranslations('lessons')
  // ...
}
```

**Dynamic status lookup (replaces STATUS_LABELS records):**
```typescript
// Before:
const STATUS_LABELS = { scheduled: 'מתוכנן', completed: 'הושלם', ... }
// After:
const t = await getTranslations('common')
const label = t(`status.${lesson.status}`)
```

**Day names (replaces HEBREW_DAYS arrays):**
```typescript
// Pass day key instead of hardcoded array index:
t(`common.days.${['sun','mon','tue','wed','thu','fri','sat'][luxonWeekday - 1]}`)
```

### Delivery order for wiring

1. `Sidebar.tsx` — nav labels, section headers, role labels, logout
2. `(dashboard)/layout.tsx` — dir attribute (Story 1 already covers this)
3. `dashboard/page.tsx` — KPI labels, status counters, table headers, date formatting
4. `students/` pages + `StudentForm`, `StudentSearch`
5. `parents/` pages + `ParentForm`, `SendPaymentRequestButton`
6. `teachers/` pages + teacher components
7. `lessons/` pages + all lesson components (WeekNav, NewLessonForm, NewSeriesForm, CancelLessonForm, LessonStatusForm, SeriesBanner)
8. `charges/` pages + components
9. `leads/` pages + components
10. `homework/` pages + components
11. `reports/` pages + shared report components
12. `settings/` pages + all settings components
13. `teacher/` self-service pages + TeacherWeekNav, TeacherLessonOutcomeForm, CalendarSubscribeSection
14. `SupportModeBanner.tsx`

**Files changed:** All ~65 dashboard `.tsx` files listed in Story 2.

---

## Story 4 — Admin Shell i18n

Wire translations into all `src/components/admin/` and `src/app/(admin)/admin/` files using the `admin` namespace. Admin shell uses English as the primary audience (superadmin) — Hebrew translations still required for consistency.

**Files changed:** ~12 admin components and pages.

---

## Story 5 — RTL/LTR Polish + Number/Date Formatting

### RTL layout validation
- Check all flex/grid layouts work correctly in `dir="ltr"` (border positions, padding sides, icon placement).
- The sidebar must flip correctly: `border-l` in RTL becomes `border-r` in LTR. Use `border-e` (logical property) for locale-agnostic borders.
- Tailwind CSS v4 supports logical properties — prefer `ps-` / `pe-` / `ms-` / `me-` over `pl-` / `pr-` / `ml-` / `mr-` where direction matters. Only update properties that actually break in LTR — do not blanket-replace all margin/padding.

### Number formatting
In the English locale, numbers should use `.` as decimal separator (already the case with `toLocaleString('he-IL')` outputting `₪` prefix). Consider `new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', { style: 'currency', currency: 'ILS' })` in a shared util.

**New util:** `src/lib/i18n/formatCurrency.ts` — `formatCurrency(amount, locale)` returns locale-appropriate string.

### Date formatting (dashboard `formatHebrewDate`)
The `formatHebrewDate` function in `dashboard/page.tsx` currently builds a Hebrew-specific string. Replace with a locale-aware version using `messages/he.json:dashboard.todayLabel` ICU template and `messages/en.json:dashboard.todayLabel`.

**Files changed:**
- `src/app/(dashboard)/layout.tsx` (logical border)
- `src/components/dashboard/Sidebar.tsx` (logical border)
- `src/lib/i18n/formatCurrency.ts` (new)
- `src/app/(dashboard)/dashboard/page.tsx` (date format)

---

## Out of Scope

- Arabic support (Sprint 23)
- Portal (`/portal/[orgId]/`) i18n — portal is parent-facing mobile app, separate sprint
- Booking WebView (`/book/[token]`) i18n — deferred
- WhatsApp message body i18n (WhatsApp messages use the template system, not next-intl)
- URL-based locale routing (no SEO value for auth-gated dashboard)
- Locale auto-detection from `Accept-Language` header (Sprint 23)
- Pluralization rules (all current strings are singular-only or explicit counts)
- Right-to-left number rendering edge cases in charts (recharts handles internally)

---

## Delivery Order

1. Story 0 — Install next-intl, wire config, create placeholder message files
2. Story 1 — Schema migration, `LocaleSwitcher`, `saveLocaleAction`, layout `dir` fix
3. Story 2 — Complete `messages/he.json` + `messages/en.json`
4. Story 3 — Wire `useTranslations` across all dashboard pages + components
5. Story 4 — Admin shell i18n
6. Story 5 — RTL/LTR polish + number/date formatting

---

## Test Plan

### Automated

- `src/app/(dashboard)/settings/locale/actions.test.ts` (new):
  - `saveLocaleAction` with `'en'` → sets cookie + updates `profiles.preferred_locale`
  - `saveLocaleAction` in support mode → throws (requireMutation blocks)
  - `saveLocaleAction` with invalid locale → Zod validation error

- No test needed for `LocaleSwitcher` — it is a thin form wrapper around a server action.

### Manual QA Checklist

1. Log in as Hebrew user → UI renders in Hebrew, `dir="rtl"` on layout div
2. Switch locale to English via switcher → page reloads in English, `dir="ltr"`
3. Log out, log back in → English locale persists (cookie + DB)
4. Log in on a different browser → Hebrew (fresh cookie) — locale not shared across devices until Story 1's login-time cookie-sync is fully wired
5. Support mode: enter an org's dashboard as superadmin → `dir` follows org user's locale? No — dir follows the admin's own cookie locale. Confirm this is acceptable.
6. All navigation labels render correctly in English
7. Status badges (lesson, charge, homework) render in English
8. Number formatting: `₪1,234` in Hebrew (he-IL), `₪1,234` in English (consistent — ILS uses same format)
9. Dashboard date: Hebrew → "יום שני, 5 ב..."; English → "Monday, April 5"

---

## New Files Summary

| File | Purpose |
|---|---|
| `messages/he.json` | Full Hebrew translation map |
| `messages/en.json` | Full English translation map |
| `src/i18n/request.ts` | next-intl request config (cookie reader) |
| `src/app/(dashboard)/settings/locale/actions.ts` | saveLocaleAction |
| `src/components/dashboard/LocaleSwitcher.tsx` | Locale toggle UI |
| `src/lib/i18n/formatCurrency.ts` | Locale-aware currency formatter |
| `supabase/migrations/20260419000001_profiles_locale.sql` | profiles.preferred_locale column |
| `src/app/(dashboard)/settings/locale/actions.test.ts` | saveLocaleAction unit tests |

---

## Exit Criteria

- [ ] English locale renders the full dashboard in English with `dir="ltr"`
- [ ] Hebrew locale renders identically to pre-sprint (zero visible regression)
- [ ] Locale preference persists across page reloads (cookie)
- [ ] `profiles.preferred_locale` updated on locale change
- [ ] `LocaleSwitcher` visible and functional in the dashboard
- [ ] `npm test` passes 100%
- [ ] Manual QA checklist above completed
