# אפיון פיצר קבוצות תלמידים

## סקירה כללית

פיצר הקבוצות מאפשר לארגן תלמידים לקבוצות לצורך תזמון שיעורים קבוצתיים. חשוב להבחין בין שלושה מושגים נפרדים במערכת המשתמשים כולם במילה "קבוצה":

| מושג | ישות | טבלה |
|------|------|-------|
| **קבוצת תלמידים** | רשומה מנוהלת עם שמות ותלמידים | `קבוצות תלמידים` (Airtable) |
| **שיעור קבוצתי** | סוג שיעור (`lesson_type = 'group'`) | `lessons` |
| **מנוי קבוצתי** | סוג מנוי + שדה על תלמיד (`מנוי_קבוצתי`) | `subscriptions` + `students` |

---

## מודל הנתונים

### טבלת Airtable

- **שם טבלה:** `קבוצות תלמידים`
- **מזהה טבלה:** `tblUURXeFzvg2hcGQ`
- **מפתח ראשי:** `group_name`

### שדות

| שדה Airtable | סוג | תיאור | ניתן לעריכה |
|---|---|---|---|
| `group_name` | `string` | שם הקבוצה | כן |
| `students` | `LinkedRecord[]` | רשומות מקושרות לטבלת תלמידים | כן |
| `status` | `'active' \| 'paused'` | סטטוס הקבוצה | כן |
| `student_names` | `string[]` | Lookup של שמות תלמידים (מחושב) | לא |
| `student_count` | `number` | ספירת תלמידים (מחושב) | לא |

### TypeScript Interface

```typescript
// types.ts
export interface StudentGroup {
  id: string;
  name: string;
  studentIds: string[];
  studentNames?: string[];
  studentCount?: number;
  status: 'active' | 'paused';
}
```

---

## ארכיטקטורה

### זרימת נתונים

```
Students.tsx / Calendar.tsx
        ↓
   useGroups.ts  (hook — state מקומי)
        ↓
   nexusApi.ts  (student groups CRUD)
        ↓
  /api/airtable/*  (airtableProxy — backend)
        ↓
   Airtable API  (קבוצות תלמידים)
```

### API Endpoints

כל הקריאות מנותבות דרך ה-proxy הגנרי `/api/airtable/{tableId}`:

| פעולה | Method | נתונים שנשלחים |
|--------|--------|----------------|
| שליפת כל הקבוצות | `GET` | `?pageSize=100` |
| שליפת קבוצה בודדת | `GET` | `/{recordId}` |
| יצירת קבוצה | `POST` | `group_name`, `status`, `students[]` |
| עדכון קבוצה | `PATCH` | שדות לעדכון בלבד |
| מחיקת קבוצה | `DELETE` | `/{recordId}` |

---

## Hook — `useGroups.ts`

### מה הוא חושף

| ערך / פונקציה | סוג | תיאור |
|---|---|---|
| `groups` | `StudentGroup[]` | כל הקבוצות |
| `activeGroups` | `StudentGroup[]` | קבוצות פעילות בלבד (`status === 'active'`) |
| `isLoading` | `boolean` | מצב טעינה |
| `createGroup(data)` | `async` | יוצר קבוצה ומעדכן state |
| `updateGroup(id, updates)` | `async` | מעדכן קבוצה ומעדכן state |
| `deleteGroup(id)` | `async` | מוחק קבוצה ומעדכן state |
| `refresh()` | `async` | טוען מחדש מ-Airtable |

### עדכון state אופטימיסטי

לאחר כל פעולת CRUD, ה-Hook מעדכן את ה-state המקומי ישירות ללא טעינה מחדש מהשרת.

---

## ממשק ניהול קבוצות

### מיקום

- **עמוד:** תלמידים (`/students`)
- **טאב:** תת-טאב "קבוצות" (לצד "תלמידים")
- **קומפוננטה:** `Students.tsx`

### תצוגת הרשימה

לכל קבוצה מוצגים:
- שם הקבוצה
- מספר תלמידים
- שמות התלמידים (מ-lookup)
- סטטוס: `פעיל` / `מושהה`
- כפתורי פעולה: עריכה / השהיה-חידוש / מחיקה

### חיפוש

שדה חיפוש חופשי לפי שם קבוצה (client-side filtering).

### פעולות זמינות

| פעולה | טריגר | אישור |
|-------|--------|-------|
| יצירת קבוצה | כפתור "קבוצה חדשה" | — |
| עריכת קבוצה | כפתור עריכה בשורה | — |
| השהיה / חידוש | toggle סטטוס בשורה | — |
| מחיקת קבוצה | כפתור מחיקה | `confirm()` |

---

## מודל יצירה/עריכה — `GroupFormModal`

### הפעלה

- **יצירה:** פתיחת ה-Modal ללא `group` prop
- **עריכה:** פתיחת ה-Modal עם `group` prop מאוכלס

### שדות

| שדה | סוג | חובה | תיאור |
|-----|-----|-------|-------|
| שם קבוצה | `string` | כן | שם ייחודי לקבוצה |
| תלמידים | `StudentsPicker` | כן (לפחות 1) | בחירה מרשימת תלמידים פעילים |
| סטטוס | `active \| paused` | כן | ברירת מחדל: `active` |

### ולידציות

- שם קבוצה לא יכול להיות ריק
- חובה לבחור לפחות תלמיד אחד

### שמירה

- **יצירה:** `createGroup(data)` → Airtable POST → toast "הקבוצה נוצרה בהצלחה"
- **עריכה:** `updateGroup(id, data)` → Airtable PATCH → toast "הקבוצה עודכנה בהצלחה"

---

## `GroupPicker` — בחירת קבוצה

### שימוש

רכיב חיפוש ובחירה המשמש בעיקר ביומן כאשר סוג השיעור הוא `group`.

### התנהגות

- **מציג רק קבוצות פעילות** (`activeGroups` — `status === 'active'` בלבד)
- ניתן לחיפוש לפי שם
- עם בחירת קבוצה מוחזרים: `groupId`, `studentIds[]`, `studentNames[]`

### Props

| Prop | סוג | תיאור |
|------|-----|-------|
| `value` | `string \| null` | מזהה הקבוצה הנבחרת |
| `onChange` | `(groupId, studentIds, studentNames) => void` | callback עם בחירה |

---

## שיעורים קבוצתיים ביומן — `Calendar.tsx`

### זרימת שיעור קבוצתי

1. המשתמש בוחר סוג שיעור `קבוצתי`
2. מוצג `GroupPicker` לבחירת קבוצה
3. עם בחירת קבוצה → `studentIds[]` של הקבוצה מאכלסים את שדה `studentIds` בשיעור
4. ה-`_selectedGroupId` נשמר ב-UI state בלבד (לא נשמר ברשומת השיעור ב-Airtable)
5. השיעור נשמר עם `studentIds[]` ו-`lesson_type = 'group'`

### הערה חשובה

השיעור **אינו** שומר מזהה קבוצה (`groupId`). הקישור לקבוצה קיים רק ב-UI state בזמן בחירה. לאחר שמירה, השיעור מכיל את `studentIds[]` בלבד.

---

## חיובים — לוגיקת תמחור שיעור קבוצתי

לוגיקת התמחור חלה על **סוג השיעור** (`lesson_type = 'group'`), לא על חברות בטבלת קבוצות.

### סדר עדיפויות

1. **מנוי פעיל בתאריך השיעור** → ₪0
2. **`line_amount` מוגדר על השיעור** → לפי הערך
3. **ברירת מחדל** → ₪120

### שירותים

| שירות | תפקיד |
|--------|--------|
| `billing/billingRules.ts` | לוגיקת תמחור server-side |
| `services/billingService.ts` | `calculateLessonPrice` |
| `services/billingDetailsService.ts` | פירוט חיובים ל-PDF |

---

## מנוי קבוצתי

### שדה על תלמיד

לתלמידים עם מנוי קבוצתי פעיל קיים שדה `מנוי_קבוצתי` (checkbox/linked record) בטבלת תלמידים.

### שימושים

| שימוש | תיאור |
|--------|--------|
| `billingEnrichment.ts` | קריאת השדה לקביעת `subscriptionType = 'קבוצתי'` |
| `subscriptionsService.ts` | ניקוי השדה עם פקיעת המנוי |

### ניקוי אוטומטי

כאשר מנוי מסוג `קבוצתי` פוקע, `subscriptionsService.clearStudentSubscriptionLink` מנקה את שדה `מנוי_קבוצתי` מהתלמיד כדי שלא יוצג כבעל מנוי פעיל.

---

## סטטוסי קבוצה

| ערך | תווית | משמעות |
|-----|--------|---------|
| `active` | פעיל | הקבוצה מוצגת ב-`GroupPicker`, ניתן לשבץ שיעורים |
| `paused` | מושהה | מוסתרת מ-`GroupPicker`, ניהול בלבד דרך טאב קבוצות |

---

## תלויות טכניות

| שירות / קומפוננטה | שימוש |
|---|---|
| `hooks/useGroups.ts` | state ו-CRUD לקבוצות |
| `nexusApi.fetchGroups` | שליפת כל הקבוצות |
| `nexusApi.createGroup` | יצירת קבוצה |
| `nexusApi.updateGroup` | עדכון קבוצה |
| `nexusApi.deleteGroup` | מחיקת קבוצה |
| `components/GroupFormModal.tsx` | מודל יצירה/עריכה |
| `components/GroupPicker.tsx` | בחירת קבוצה ביומן |
| `components/Students.tsx` | טאב ניהול קבוצות |
| `components/Calendar.tsx` | שיבוץ שיעורים קבוצתיים |
| `services/billingService.ts` | תמחור שיעור קבוצתי |
| `services/subscriptionsService.ts` | ניקוי מנוי קבוצתי |
| `services/billingEnrichment.ts` | העשרת נתוני חיוב |
| `contracts/types.ts` | `StudentGroupsAirtableFields` |
| `contracts/fieldMap.ts` | מיפוי שדות + שדות read-only |
| `contracts/validators.ts` | `validateStudentGroupsFields` |
| `server/airtableProxy.ts` | נקודת גישה ל-Airtable (כולל `studentGroups` ב-allowlist) |

---

## פעולות עתידיות (טרם ממומשות)

- **שיוך קבוצה לשיעור** — שמירת `groupId` על רשומת שיעור לצורך מעקב ודוחות
- **דוח נוכחות לקבוצה** — סיכום שיעורים לפי קבוצה
- **קבוצות ביומן** — תצוגה ייעודית לשיעורים קבוצתיים ביומן השבועי
