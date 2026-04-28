# Sprint 13 — Single Lesson Scheduling + Parent Portal + UX/UI Polish

**Status:** In Progress  
**Goal:** Admin and teacher can create single (non-recurring) lessons from the dashboard. Parents get a dedicated web portal at `/portal/[orgId]` with WhatsApp OTP login to view their schedule, balance, and book new lessons. The dashboard UX is restructured (sidebar grouping, settings landing page, loading states) before i18n work begins.

---

## Pre-Sprint State

Three gaps exist after Sprint 12:

1. **Scheduling:** The only way to create a lesson from the dashboard is `/lessons/new-series` (recurring series). There is no `/lessons/new` for a one-off lesson. Teachers have no lesson creation path at all — they are completely passive.

2. **Parent access:** Parents interact with the system exclusively via a one-time 15-minute JWT link sent by WhatsApp. There is no persistent web portal. Parents cannot check their balance or upcoming lessons without pinging the admin.

3. **Dashboard UX:** `/settings` 404s (no landing page). The sidebar is a flat list of 14 items with no visual grouping. No `loading.tsx` files cause blank-page flashes on navigation. The lessons page has only one creation button ("שיעורים קבועים") — making it appear that single lessons cannot be created at all.

---

## Story 1 — Schema: portal_otps

**`supabase/migrations/20260401000001_portal_otps.sql`**

```sql
-- Phone OTP storage for parent portal login.
-- OTPs are short-lived (10 min), single-use, stored as SHA-256 hash.
CREATE TABLE portal_otps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone           text NOT NULL,
  otp_hash        text NOT NULL,
  expires_at      timestamptz NOT NULL,
  used            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE portal_otps IS 'One-time OTP tokens for parent portal login. Hashed (SHA-256), expire after 10 minutes, single-use.';

-- Only query by (phone, org_id) for unused OTPs
CREATE INDEX idx_portal_otps_lookup ON portal_otps(phone, organization_id) WHERE NOT used;

-- Service role only — no parent or dashboard user should query this directly
ALTER TABLE portal_otps ENABLE ROW LEVEL SECURITY;
-- No public policies — accessible via service role key only
```

---

## Story 2 — lib: createLesson

**`src/lib/lessons/createLesson.ts`** (new)

Single lesson creation — the non-recurring equivalent of `createLessonSeries`. Uses the same conflict-check pattern.

```typescript
'use server'

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CreateLessonParams = {
  orgId: string
  teacherId: string
  studentId: string
  date: string            // YYYY-MM-DD in org timezone
  startTime: string       // HH:MM in org timezone
  durationMinutes: number
  createdByProfileId: string
}

export type CreateLessonResult = {
  lessonId: string
  startAt: string         // UTC ISO
  endAt: string           // UTC ISO
}

export class LessonConflictError extends Error {
  constructor(reason: 'holiday' | 'teacher_conflict' | 'student_conflict') {
    super(`Cannot create lesson: ${reason}`)
    this.name = 'LessonConflictError'
    this.reason = reason
  }
  reason: 'holiday' | 'teacher_conflict' | 'student_conflict'
}

export async function createLesson(
  params: CreateLessonParams
): Promise<CreateLessonResult> {
  const { orgId, teacherId, studentId, date, startTime, durationMinutes, createdByProfileId } = params
  const db = createServiceRoleClient()

  // 1. Fetch org timezone
  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()
  if (!org) throw new Error(`Organization not found: ${orgId}`)

  // 2. Build UTC start/end
  const slotStart = DateTime.fromISO(`${date}T${startTime}`, { zone: org.timezone }).toUTC()
  const slotEnd = slotStart.plus({ minutes: durationMinutes })
  const startUtc = slotStart.toISO()!
  const endUtc = slotEnd.toISO()!

  // 3. Holiday check
  const { data: holiday } = await db
    .from('organization_holidays')
    .select('id')
    .eq('organization_id', orgId)
    .eq('date', date)
    .maybeSingle()
  if (holiday) throw new LessonConflictError('holiday')

  // 4. Teacher overlap check (non-cancelled lessons)
  const { data: teacherConflict } = await db
    .from('lessons')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .lt('start_at', endUtc)
    .gt('end_at', startUtc)
    .limit(1)
  if (teacherConflict?.length) throw new LessonConflictError('teacher_conflict')

  // 5. Student overlap check via lesson_students
  const { data: studentLessonIds } = await db
    .from('lesson_students')
    .select('lesson_id')
    .eq('student_id', studentId)
  if (studentLessonIds?.length) {
    const ids = studentLessonIds.map((r) => r.lesson_id)
    const { data: studentConflict } = await db
      .from('lessons')
      .select('id')
      .in('id', ids)
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .lt('start_at', endUtc)
      .gt('end_at', startUtc)
      .limit(1)
    if (studentConflict?.length) throw new LessonConflictError('student_conflict')
  }

  // 6. Insert lesson
  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    .insert({
      organization_id: orgId,
      teacher_id: teacherId,
      start_at: startUtc,
      end_at: endUtc,
      status: 'scheduled',
      lesson_type: 'individual',
      max_students: 1,
    })
    .select('id, start_at, end_at')
    .single()
  if (lessonError || !lesson) throw new Error(`Failed to create lesson: ${lessonError?.message}`)

  // 7. Insert lesson_students
  const { error: lsError } = await db
    .from('lesson_students')
    .insert({ lesson_id: lesson.id, student_id: studentId, organization_id: orgId })
  if (lsError) {
    await db.from('lessons').delete().eq('id', lesson.id)
    throw new Error(`Failed to link student: ${lsError.message}`)
  }

  return { lessonId: lesson.id, startAt: lesson.start_at, endAt: lesson.end_at }
}
```

---

## Story 3 — lib: portal session + OTP

### `src/lib/portal/session.ts` (new)

```typescript
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'portal_session'
const EXPIRY_SECONDS = 60 * 60 * 24 * 30  // 30 days

export interface PortalSession {
  parentId: string
  orgId: string
}

function getSecret(): Uint8Array {
  const secret = process.env.PORTAL_JWT_SECRET
  if (!secret) throw new Error('PORTAL_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signPortalSession(session: PortalSession): Promise<string> {
  return new SignJWT({ ...session, type: 'portal_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(getSecret())
}

export async function verifyPortalSession(token: string): Promise<PortalSession> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.type !== 'portal_session') throw new Error('Invalid token type')
  return { parentId: payload.parentId as string, orgId: payload.orgId as string }
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    return await verifyPortalSession(token)
  } catch {
    return null
  }
}

export async function setPortalSessionCookie(session: PortalSession): Promise<void> {
  const token = await signPortalSession(session)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: EXPIRY_SECONDS,
    path: '/',
  })
}

export async function clearPortalSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
```

### `src/lib/portal/otp.ts` (new)

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/** Generates a cryptographically random 6-digit OTP string. */
export function generateOtp(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(array[0] % 1_000_000).padStart(6, '0')
}

/** SHA-256 hash of the OTP (Web Crypto — available in Node 18+). */
export async function hashOtp(otp: string): Promise<string> {
  const data = new TextEncoder().encode(otp)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Buffer.from(hashBuffer).toString('hex')
}

export interface StoreOtpParams {
  phone: string
  orgId: string
  otp: string
}

/** Stores hashed OTP in portal_otps (expires in 10 min). Returns the plain OTP for sending. */
export async function storeOtp({ phone, orgId, otp }: StoreOtpParams): Promise<void> {
  const db = createServiceRoleClient()
  const otp_hash = await hashOtp(otp)
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error } = await db.from('portal_otps').insert({
    organization_id: orgId,
    phone,
    otp_hash,
    expires_at,
  })
  if (error) throw new Error(`Failed to store OTP: ${error.message}`)
}

export interface VerifyOtpParams {
  phone: string
  orgId: string
  otp: string
}

/** Verifies OTP — returns true and marks as used, false if wrong/expired. */
export async function verifyOtp({ phone, orgId, otp }: VerifyOtpParams): Promise<boolean> {
  const db = createServiceRoleClient()
  const otp_hash = await hashOtp(otp)

  const { data } = await db
    .from('portal_otps')
    .select('id')
    .eq('phone', phone)
    .eq('organization_id', orgId)
    .eq('otp_hash', otp_hash)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!data) return false

  await db.from('portal_otps').update({ used: true }).eq('id', data.id)
  return true
}
```

---

## Story 4 — Admin: /lessons/new

### `src/app/(dashboard)/lessons/new/page.tsx` (new)

```typescript
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTeachers } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'

export default async function NewLessonPage() {
  const { orgId, role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/lessons')

  const [teachers, students] = await Promise.all([
    getTeachers(orgId),
    getStudents(orgId),
  ])

  const activeTeachers = teachers
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, full_name: t.profile.full_name }))

  const activeStudents = students
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, full_name: s.full_name }))

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">שיעור חד פעמי</h1>
      <NewLessonForm teachers={activeTeachers} students={activeStudents} />
    </div>
  )
}
```

### `src/app/(dashboard)/lessons/new/actions.ts` (new)

```typescript
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'

const NewLessonSchema = z.object({
  teacher_id:       z.string().uuid(),
  student_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
})

export type NewLessonState = { error: string | null }

export async function createLessonAction(
  _prev: NewLessonState,
  formData: FormData
): Promise<NewLessonState> {
  const { orgId, role, profileId } = await getSession()
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה' }

  const parsed = NewLessonSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  const { teacher_id, student_id, date, start_time, duration_minutes } = parsed.data

  try {
    const result = await createLesson({
      orgId,
      teacherId: teacher_id,
      studentId: student_id,
      date,
      startTime: start_time,
      durationMinutes: duration_minutes,
      createdByProfileId: profileId,
    })
    redirect(`/lessons/${result.lessonId}`)
  } catch (err) {
    if (err instanceof LessonConflictError) {
      const messages: Record<typeof err.reason, string> = {
        holiday:          'התאריך הנבחר הוא חג — לא ניתן לקבוע שיעור',
        teacher_conflict: 'למורה יש שיעור חופף בשעה זו',
        student_conflict: 'לתלמיד יש שיעור חופף בשעה זו',
      }
      return { error: messages[err.reason] }
    }
    return { error: err instanceof Error ? err.message : 'שגיאה ביצירת השיעור' }
  }
}
```

### `src/components/dashboard/lessons/NewLessonForm.tsx` (new)

Client component using `useActionState`. Same visual pattern as `NewSeriesForm`.

Fields:
- מורה (select)
- תלמיד (select)
- תאריך (date input, `min` = today)
- שעת התחלה (time input)
- משך (select: 30/45/60/90 דקות)

On submit: calls `createLessonAction`. On conflict error: shows inline red message. On redirect (success): Next.js navigates to the new lesson detail page.

---

## Story 5 — Teacher: /teacher/new-lesson

### `src/app/(dashboard)/teacher/new-lesson/page.tsx` (new)

Teacher is resolved from session (not from form input). Shows all active org students.

```typescript
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { getStudents } from '@/lib/students'
import { NewLessonForm } from '@/components/dashboard/lessons/NewLessonForm'

export default async function TeacherNewLessonPage() {
  const { orgId, profileId, role } = await getSession()
  if (role !== 'teacher') redirect('/teacher/schedule')

  const [teacher, students] = await Promise.all([
    getTeacherByProfileId(profileId, orgId),
    getStudents(orgId),
  ])

  if (!teacher) redirect('/teacher/schedule')

  const activeStudents = students
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, full_name: s.full_name }))

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">שיעור חדש</h1>
      {/* NewLessonForm in teacher mode: teacher is fixed, no teacher select shown */}
      <NewLessonForm
        students={activeStudents}
        fixedTeacherId={teacher.id}
      />
    </div>
  )
}
```

### `src/app/(dashboard)/teacher/new-lesson/actions.ts` (new)

Same Zod schema as admin, but `teacher_id` comes from session:

```typescript
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'

const TeacherLessonSchema = z.object({
  student_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
})

export type NewLessonState = { error: string | null }

export async function createTeacherLessonAction(
  _prev: NewLessonState,
  formData: FormData
): Promise<NewLessonState> {
  const { orgId, profileId, role } = await getSession()
  if (role !== 'teacher') return { error: 'אין הרשאה' }

  const teacher = await getTeacherByProfileId(profileId, orgId)
  if (!teacher) return { error: 'לא נמצא פרופיל מורה' }

  const parsed = TeacherLessonSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  const { student_id, date, start_time, duration_minutes } = parsed.data

  try {
    const result = await createLesson({
      orgId,
      teacherId: teacher.id,
      studentId: student_id,
      date,
      startTime: start_time,
      durationMinutes: duration_minutes,
      createdByProfileId: profileId,
    })
    redirect(`/teacher/schedule/${result.lessonId}`)
  } catch (err) {
    if (err instanceof LessonConflictError) {
      const messages: Record<typeof err.reason, string> = {
        holiday:          'התאריך הנבחר הוא חג — לא ניתן לקבוע שיעור',
        teacher_conflict: 'יש לך שיעור חופף בשעה זו',
        student_conflict: 'לתלמיד יש שיעור חופף בשעה זו',
      }
      return { error: messages[err.reason] }
    }
    return { error: err instanceof Error ? err.message : 'שגיאה ביצירת השיעור' }
  }
}
```

**`NewLessonForm` prop update:** Add optional `fixedTeacherId?: string`. When set, teacher select is hidden and the hidden input sends the fixed ID to the action. The form also imports `createTeacherLessonAction` when in teacher mode — pass the action as a prop.

---

## Story 6 — Parent Portal: Layout + Login

### `src/app/portal/[orgId]/layout.tsx` (new)

Mobile-first shell. No Supabase session. Max-width 480px centered.

```typescript
import type { ReactNode } from 'react'

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-[480px] mx-auto min-h-screen bg-white shadow-sm flex flex-col">
        {children}
      </div>
    </div>
  )
}
```

### `src/app/portal/[orgId]/page.tsx` (new)

```typescript
import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal/session'

export default async function PortalRootPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (session?.orgId === orgId) {
    redirect(`/portal/${orgId}/home`)
  }
  redirect(`/portal/${orgId}/login`)
}
```

### `src/app/portal/[orgId]/login/page.tsx` (new)

Two-step login. Step is determined by `?step=verify` in URL.

- **Step 1 (default):** Phone number input form → calls `requestOtpAction`
- **Step 2 (`?step=verify`):** 6-digit OTP input form → calls `verifyOtpAction`

Both forms use `useActionState`. Error shown inline. No library needed.

### `src/app/portal/[orgId]/login/actions.ts` (new)

```typescript
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone } from '@/lib/phone'
import { decryptToken } from '@/lib/crypto'
import { sendTextMessage } from '@/lib/whatsapp/send'
import { generateOtp, storeOtp, verifyOtp } from '@/lib/portal/otp'
import { setPortalSessionCookie } from '@/lib/portal/session'

const PhoneSchema = z.object({
  phone: z.string().min(9),
})

const OtpSchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/),
})

export type LoginState = { error: string | null }

export async function requestOtpAction(
  orgId: string,
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = PhoneSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'מספר טלפון לא תקין' }

  const phone = normalizePhone(parsed.data.phone)
  const db = createServiceRoleClient()

  // Verify parent exists in this org
  const { data: parent } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (!parent) {
    // Security: don't reveal whether the phone exists — show same message
    return { error: 'לא נמצא חשבון משויך למספר זה. פנה/י לבית הספר.' }
  }

  // Get org WhatsApp config
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', orgId)
    .single()

  if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
    return { error: 'שירות הכניסה אינו זמין כרגע. פנה/י לבית הספר.' }
  }

  const otp = generateOtp()
  await storeOtp({ phone, orgId, otp })

  const accessToken = decryptToken(org.whatsapp_access_token as string)
  const message = `קוד הכניסה שלך ל-LESSIO: *${otp}*\nהקוד בתוקף ל-10 דקות.`

  try {
    await sendTextMessage(phone, message, accessToken, org.whatsapp_phone_number_id as string)
  } catch (err) {
    console.error('[requestOtpAction] Failed to send OTP via WhatsApp', { orgId, err })
    return { error: 'שגיאה בשליחת הקוד. נסה/י שוב.' }
  }

  redirect(`/portal/${orgId}/login?step=verify&phone=${encodeURIComponent(phone)}`)
}

export async function verifyOtpAction(
  orgId: string,
  phone: string,
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = OtpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'קוד לא תקין — חייב להיות 6 ספרות' }

  const valid = await verifyOtp({ phone, orgId, otp: parsed.data.otp })
  if (!valid) return { error: 'קוד שגוי או שפג תוקפו. חזור/י ובקש/י קוד חדש.' }

  const db = createServiceRoleClient()
  const { data: parent } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .single()

  if (!parent) return { error: 'שגיאה — נסה/י שוב' }

  await setPortalSessionCookie({ parentId: parent.id, orgId })
  redirect(`/portal/${orgId}/home`)
}
```

---

## Story 7 — Parent Portal: Home + Payments

### `src/app/portal/[orgId]/home/page.tsx` (new)

Server component. Reads session from cookie. Shows:
- Org name + parent name in top bar
- Upcoming lessons (next 4, from `lesson_students` join + lessons)
- Outstanding balance (sum of `pending` charges)
- Bottom tab bar: בית | קבע שיעור | תשלומים

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getOrgTimezone } from '@/lib/organizations'
import { formatTime, formatDate } from '@/lib/lessons'
import { PortalTabBar } from '@/components/portal/PortalTabBar'

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const db = createServiceRoleClient()
  const timezone = await getOrgTimezone(orgId)
  const now = new Date().toISOString()

  const [parentResult, orgResult, lessonsResult, balanceResult] = await Promise.all([
    db.from('parents').select('full_name').eq('id', session.parentId).single(),
    db.from('organizations').select('name').eq('id', orgId).single(),
    // Upcoming lessons for students of this parent
    db
      .from('lesson_students')
      .select(`
        lessons (
          id, start_at, end_at, status,
          teachers ( profiles ( full_name ) )
        ),
        students ( full_name )
      `)
      .eq('organization_id', orgId)
      .in('student_id',
        db
          .from('relationships')
          .select('student_id')
          .eq('parent_id', session.parentId)
          .eq('organization_id', orgId)
      )
      .eq('lessons.status', 'scheduled')
      .gte('lessons.start_at', now)
      .order('lessons.start_at', { ascending: true })
      .limit(4),
    // Outstanding balance
    db
      .from('charges')
      .select('amount')
      .eq('parent_id', session.parentId)
      .eq('organization_id', orgId)
      .eq('status', 'pending'),
  ])

  const parentName = parentResult.data?.full_name ?? ''
  const orgName = orgResult.data?.name ?? ''
  const lessons = lessonsResult.data ?? []
  const balance = (balanceResult.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <div className="flex flex-col flex-1 pb-16">
      {/* Top bar */}
      <header className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <span className="font-bold text-gray-900">{orgName}</span>
        <span className="text-sm text-gray-500">{parentName}</span>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Balance */}
        {balance > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 font-medium">יתרה לתשלום</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">₪{balance.toFixed(2)}</p>
            <Link
              href={`/portal/${orgId}/payments`}
              className="mt-2 inline-block text-sm text-amber-700 underline"
            >
              לפרטים ותשלום →
            </Link>
          </div>
        )}

        {/* Upcoming lessons */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">שיעורים קרובים</h2>
          {lessons.length === 0 ? (
            <p className="text-sm text-gray-400">אין שיעורים מתוכננים</p>
          ) : (
            <div className="space-y-2">
              {lessons.map((row) => {
                const lesson = row.lessons as unknown as { id: string; start_at: string; end_at: string; teachers: { profiles: { full_name: string } } }
                const student = row.students as unknown as { full_name: string }
                return (
                  <div key={lesson.id} className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(lesson.start_at, timezone)} · {formatTime(lesson.start_at, timezone)}–{formatTime(lesson.end_at, timezone)}
                    </p>
                    <p className="text-xs text-gray-400">{lesson.teachers.profiles.full_name}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Book CTA */}
        <Link
          href={`/portal/${orgId}/book`}
          className="block w-full text-center py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          קבע שיעור חדש
        </Link>
      </main>

      <PortalTabBar orgId={orgId} active="home" />
    </div>
  )
}
```

### `src/app/portal/[orgId]/payments/page.tsx` (new)

Lists all charges for this parent:
- Section "ממתין לתשלום": pending charges with payment_link (if exists)
- Section "היסטוריה": paid charges (last 20)

Each pending charge with `payment_link` shows a "לתשלום" button linking to the provider URL.

### `src/components/portal/PortalTabBar.tsx` (new)

```typescript
'use client'
import Link from 'next/link'
import { Home, CalendarPlus, Receipt } from 'lucide-react'

const TABS = [
  { id: 'home',     label: 'בית',     href: (orgId: string) => `/portal/${orgId}/home`,     icon: Home },
  { id: 'book',     label: 'קביעה',   href: (orgId: string) => `/portal/${orgId}/book`,     icon: CalendarPlus },
  { id: 'payments', label: 'תשלומים', href: (orgId: string) => `/portal/${orgId}/payments`, icon: Receipt },
]

export function PortalTabBar({ orgId, active }: { orgId: string; active: string }) {
  return (
    <nav className="fixed bottom-0 right-0 left-0 max-w-[480px] mx-auto border-t border-gray-200 bg-white flex">
      {TABS.map(({ id, label, href, icon: Icon }) => (
        <Link
          key={id}
          href={href(orgId)}
          className={`flex-1 flex flex-col items-center py-3 text-xs gap-1 transition-colors ${
            active === id ? 'text-blue-600' : 'text-gray-500'
          }`}
        >
          <Icon size={20} />
          {label}
        </Link>
      ))}
    </nav>
  )
}
```

---

## Story 8 — Parent Portal: Booking

### `src/app/portal/[orgId]/book/page.tsx` (new)

```typescript
import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal/session'
import { PortalBookingFlow } from '@/components/portal/PortalBookingFlow'

export default async function PortalBookPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) redirect(`/portal/${orgId}/login`)

  return <PortalBookingFlow orgId={orgId} parentId={session.parentId} />
}
```

### `src/app/portal/[orgId]/book/actions.ts` (new)

Portal-specific server actions that authenticate via portal session cookie instead of booking JWT. Delegates to the same lib functions used by `/book/[token]`.

```typescript
'use server'

import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getAvailableSlots,
  getAvailabilitySummary,
  createSlotLock,
  confirmBooking,
  type AvailableSlot,
  type AvailabilitySummary,
} from '@/lib/booking'

async function requirePortalSession(orgId: string) {
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) throw new Error('Unauthorized')
  return session
}

export async function getPortalTeachersAction(orgId: string) {
  await requirePortalSession(orgId)
  const db = createServiceRoleClient()
  const { data } = await db
    .from('teachers')
    .select('id, profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('is_active', true)
  return (data ?? []).map((t) => ({
    id: t.id,
    display_name: (t.profiles as unknown as { full_name: string })?.full_name ?? '',
  }))
}

export async function getPortalSlotsAction(
  orgId: string,
  teacherId: string,
  date: string,
  durationMinutes: number
): Promise<AvailableSlot[]> {
  await requirePortalSession(orgId)
  return getAvailableSlots({ teacherId, date, durationMinutes, organizationId: orgId })
}

export async function getPortalAvailabilitySummaryAction(
  orgId: string,
  teacherId: string,
  durationMinutes: number,
  weekStart?: string
): Promise<AvailabilitySummary> {
  await requirePortalSession(orgId)
  return getAvailabilitySummary({ teacherId, organizationId: orgId, durationMinutes, weekStart })
}

export async function portalLockSlotAction(
  orgId: string,
  teacherId: string,
  startAt: string,
  endAt: string
) {
  const session = await requirePortalSession(orgId)
  // Resolve a student for this parent (first active student)
  const db = createServiceRoleClient()
  const { data: rel } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()
  if (!rel) throw new Error('No student found for this parent')

  return createSlotLock({
    teacherId,
    startAt,
    endAt,
    studentId: rel.student_id,
    organizationId: orgId,
  })
}

export async function portalConfirmBookingAction(
  orgId: string,
  lockId: string,
  teacherId: string
) {
  const session = await requirePortalSession(orgId)
  const db = createServiceRoleClient()
  const { data: rel } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()
  if (!rel) throw new Error('No student found for this parent')

  return confirmBooking({
    lockId,
    studentId: rel.student_id,
    teacherId,
    organizationId: orgId,
  })
}
```

### `src/components/portal/PortalBookingFlow.tsx` (new)

Client component. Mirrors `BookingFlow` but imports portal actions instead of `/book/[token]` actions. Reuses `TeacherSelect`, `AvailabilityCalendar`, `BookingConfirm`, `BookingSuccess`, `BookingError` components unchanged.

Steps: TeacherSelect → AvailabilityCalendar → BookingConfirm → BookingSuccess/Error.

---

## Story 9 — UX/UI: Sidebar + Settings Landing

### `src/components/dashboard/Sidebar.tsx` (update)

Replace the flat `NAV_ITEMS` array with a `NAV_SECTIONS` structure that renders section headers between groups.

**Section structure:**
```typescript
const NAV_SECTIONS = [
  {
    id: 'ops',
    label: null,  // no header for the primary section
    items: [
      { href: '/dashboard',   label: 'לוח הבקרה',      icon: LayoutDashboard, roles: ['owner', 'admin'] },
      { href: '/students',    label: 'תלמידים',          icon: GraduationCap,   roles: ['owner', 'admin'] },
      { href: '/parents',     label: 'הורים',            icon: Users,           roles: ['owner', 'admin'] },
      { href: '/teachers',    label: 'מורים',            icon: UserRound,       roles: ['owner', 'admin'] },
      { href: '/lessons',     label: 'שיעורים',          icon: BookOpen,        roles: ['owner', 'admin'] },
      { href: '/charges',     label: 'חיובים',           icon: Receipt,         roles: ['owner', 'admin'] },
      { href: '/leads',       label: 'לידים',            icon: UserPlus,        roles: ['owner', 'admin'] },
    ],
  },
  {
    id: 'settings',
    label: 'הגדרות',
    items: [
      { href: '/settings/whatsapp',             label: 'WhatsApp',          icon: MessageCircle, roles: ['owner'] },
      { href: '/settings/payment',              label: 'תשלומים',           icon: CreditCard,    roles: ['owner'] },
      { href: '/settings/cancellation-policy',  label: 'מדיניות ביטולים',  icon: Settings,      roles: ['owner'] },
      { href: '/settings/holidays',             label: 'חגים וחופשות',     icon: CalendarOff,   roles: ['owner', 'admin'] },
      { href: '/settings/reminders',            label: 'תזכורות',           icon: Bell,          roles: ['owner'] },
    ],
  },
  {
    id: 'teacher',
    label: null,
    items: [
      { href: '/teacher/schedule',   label: 'השיעורים שלי', icon: CalendarDays, roles: ['teacher'] },
      { href: '/teacher/new-lesson', label: 'שיעור חדש',    icon: Plus,         roles: ['teacher'] },
      { href: '/teacher/availability', label: 'הזמינות שלי', icon: Clock,       roles: ['teacher'] },
      { href: '/teacher/overrides',  label: 'חריגים ביומן', icon: CalendarX,    roles: ['teacher'] },
    ],
  },
]
```

Section header rendered as `<p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">`.
Divider `<hr className="my-2 border-gray-100" />` between sections.

### `src/app/(dashboard)/settings/page.tsx` (new)

Owner/admin only. Card grid for each settings category.

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { MessageCircle, CreditCard, Settings, CalendarOff, Bell } from 'lucide-react'

const SETTING_CARDS = [
  { href: '/settings/whatsapp',            icon: MessageCircle, label: 'WhatsApp',         desc: 'חיבור מספר WhatsApp של הארגון',         ownerOnly: true  },
  { href: '/settings/payment',             icon: CreditCard,    label: 'תשלומים',          desc: 'ספק תשלומים + שליחה אוטומטית',          ownerOnly: true  },
  { href: '/settings/cancellation-policy', icon: Settings,      label: 'מדיניות ביטולים',  desc: 'כללי חיוב על ביטולים',                  ownerOnly: true  },
  { href: '/settings/holidays',            icon: CalendarOff,   label: 'חגים וחופשות',    desc: 'תאריכים שחוסמים את לוח הזמינות',        ownerOnly: false },
  { href: '/settings/reminders',           icon: Bell,          label: 'תזכורות',          desc: 'תזכורות שיעורים ותשלומים אוטומטיות',   ownerOnly: true  },
]

export default async function SettingsPage() {
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/dashboard')

  const visibleCards = SETTING_CARDS.filter((c) => !c.ownerOnly || role === 'owner')

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">הגדרות</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {visibleCards.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 p-5 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <Icon size={22} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

---

## Story 10 — UX/UI: Lessons Page + WeekNav

### `src/app/(dashboard)/lessons/page.tsx` (update)

Replace single "יצירת שיעורים קבועים" button with two buttons:

```tsx
{(role === 'owner' || role === 'admin') && (
  <div className="flex items-center gap-2">
    <Link
      href="/lessons/new"
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
    >
      <Plus size={14} />
      שיעור חד פעמי
    </Link>
    <Link
      href="/lessons/new-series"
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
    >
      <Repeat size={14} />
      שיעורים קבועים
    </Link>
  </div>
)}
```

### `src/components/dashboard/lessons/WeekNav.tsx` (update)

Add a "היום" button that links to the lessons page without a `week` param (defaults to current week). Shown only when the displayed week is NOT the current week.

```typescript
// Add to WeekNav props: currentWeekStr (getCurrentWeekSunday result)
// Render:
{weekStr !== currentWeekStr && (
  <Link
    href={`/lessons${teacher ? `?teacher=${teacher}` : ''}`}
    className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
  >
    היום
  </Link>
)}
```

`getCurrentWeekSunday(timezone)` is already imported in the lessons page — pass it as `currentWeekStr` to `WeekNav`.

---

## Story 11 — UX/UI: Loading States + Infrastructure

### `src/app/(dashboard)/lessons/loading.tsx` (new)

```typescript
export default function LessonsLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
```

### `src/app/(dashboard)/dashboard/loading.tsx` (new)

Same spinner pattern.

### `src/app/(dashboard)/charges/loading.tsx` (new)

Same spinner pattern.

### `src/proxy.ts` (update)

Add `/portal/` to the public bypass list (alongside `/book/`):

```typescript
if (
  request.nextUrl.pathname.startsWith('/book/') ||
  request.nextUrl.pathname.startsWith('/portal/')
) {
  return NextResponse.next()
}
```

### `src/app/(dashboard)/settings/whatsapp/page.tsx` (update)

Add "קישור פורטל להורים" section below existing WhatsApp settings (only when WhatsApp is connected):

```tsx
{org.whatsapp_phone_number_id && (
  <div className="bg-white rounded-lg border border-gray-200 p-5">
    <h2 className="text-sm font-semibold text-gray-700 mb-1">קישור פורטל להורים</h2>
    <p className="text-xs text-gray-500 mb-3">
      שתף/י קישור זה עם ההורים כדי שיוכלו לגשת לפורטל האישי שלהם.
    </p>
    <PortalUrlCopy orgId={org.id} />
  </div>
)}
```

`PortalUrlCopy` is a small client component that renders the URL + a "העתק" button using `navigator.clipboard`.

### `.env.local.example` (update)

```bash
# Portal JWT (parent portal session cookies)
PORTAL_JWT_SECRET=your-portal-jwt-secret-min-32-chars
```

### `next.config.ts` (update)

Add `PORTAL_JWT_SECRET` to the env validation list alongside existing required vars.

---

## Architecture After Sprint 13

```
Admin/Owner
  → /lessons/new              → createLesson lib → lesson + lesson_students
  → /lessons/new-series       → createLessonSeries lib (unchanged)

Teacher
  → /teacher/new-lesson       → createLesson lib (teacher from session)

Parent
  → /portal/[orgId]/login     → OTP via WhatsApp → portal_session cookie
  → /portal/[orgId]/home      → upcoming lessons + balance
  → /portal/[orgId]/book      → PortalBookingFlow → booking lib (same as /book/[token])
  → /portal/[orgId]/payments  → charges list + payment links

Dashboard UX
  → Sidebar: 3 grouped sections (Operations / Settings / Teacher)
  → /settings: landing page with cards
  → /lessons: two CTA buttons + "היום" navigation
  → loading.tsx: lessons, dashboard, charges

proxy.ts: /portal/* bypasses Supabase session middleware
```

---

## What is NOT in Sprint 13

- Homework module (Sprint 14)
- WhatsApp self-service intents ("כמה אני חייב?") (Sprint 14)
- Tax receipts / חשבוניות ירוקות (Sprint 15)
- Bit / PayBox payment providers (Sprint 15)
- Custom WhatsApp message templates (Sprint 16)
- iCal calendar subscription for teachers (Sprint 16)
- Parent ability to cancel lessons from portal
- Parent ability to add/change their contact details
- Multiple students per parent in portal booking (selects primary student only)
- Mobile-responsive collapsible sidebar drawer (portal is mobile-first; dashboard sidebar stays fixed)
- Toast notifications library (forms retain inline error/success pattern)
- OTP via SMS fallback (WhatsApp only)
- Portal for students (parents only)
