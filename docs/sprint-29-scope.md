# Sprint 29 — Google Login + Google Calendar Integration

**Status:** 🚧 In Progress  
**Depends on:** Sprint 28 complete (Gmail OAuth, Analytics Pro)

**Goal:** Two distinct Google integrations:
1. **Google OAuth Login** — users can sign up and sign in with a Google account instead of email/password.  
2. **Google Calendar conflict detection** — teachers and org owners can connect their Google Calendars; when a lesson is created that overlaps a Calendar event, a soft warning is shown.

---

## Closed Decisions

- **Login and Calendar are separate OAuth connections.** Sign-in uses Supabase's built-in Google provider (identity only). Calendar access uses a separate OAuth consent that grants `calendar.readonly`. This avoids requesting broad permissions at login and works for users who registered by email.
- **Calendar conflict = soft warning.** A lesson can still be saved if the scheduler confirms the override. Pattern mirrors the existing `needsAvailabilityConfirm` flow.
- **Hierarchy:** org calendar is checked first, then the teacher's personal calendar. A conflict in either triggers the warning.
- **Token encryption:** Calendar refresh tokens are encrypted with `GOOGLE_CALENDAR_ENCRYPTION_KEY` (same AES-256-GCM as Gmail).
- **No per-teacher callback URL:** a unified `/api/google-calendar/callback` route handles both `org` and `teacher` targets using a state cookie.

---

## Story 1 — Google OAuth Login

### 1a: Supabase provider + button wiring
- Enable `[auth.external.google]` in `supabase/config.toml`
- Wire the existing stub Google button in `LoginSocialButtons.tsx` to call `supabase.auth.signInWithOAuth({ provider: 'google' })`

### 1b: New-user onboarding via `/signup/complete`
- After code exchange in `/auth/callback`, check if the user has a `profiles` row
- If no profile → redirect to `/signup/complete`
- `/signup/complete`: form with org name + full name (email pre-filled from Google metadata)
- Server action calls `createOrgForExistingUser()` (no auth user creation — already exists) → redirect to `/onboarding`

### Files touched
- `supabase/config.toml`
- `src/components/auth/LoginSocialButtons.tsx`
- `src/app/auth/callback/route.ts`
- `src/lib/auth/createOrgWithOwner.ts` (new export: `createOrgForExistingUser`)
- `src/app/signup/complete/page.tsx` (new)
- `src/app/signup/complete/CompleteSignupForm.tsx` (new)
- `src/app/signup/complete/actions.ts` (new)
- `messages/he.json`, `messages/en.json`

---

## Story 2 — Google Calendar: per-org connection

### 2a: DB + crypto
- Migration: add `google_calendar_refresh_token TEXT`, `google_calendar_email TEXT` to `organizations` and `teacher_profiles`
- `src/lib/crypto/index.ts`: add `encryptCalendarToken` / `decryptCalendarToken`
- `src/lib/env.ts`: add `GOOGLE_CALENDAR_ENCRYPTION_KEY` to `REQUIRED_IN_PRODUCTION`

### 2b: OAuth flow
- `src/lib/google-calendar/index.ts`: `buildCalendarAuthUrl`, `exchangeCalendarCode`, `refreshCalendarToken`, `checkFreeBusy`
- `src/app/api/google-calendar/connect/route.ts`: initiates OAuth (`?target=org|teacher`)
- `src/app/api/google-calendar/callback/route.ts`: verifies state, exchanges code, stores token

### 2c: Settings UI
- `src/app/(dashboard)/settings/calendar/page.tsx`: owner-only page (connect / disconnect / status)
- `src/app/(dashboard)/settings/calendar/actions.ts`: disconnect action
- `src/app/(dashboard)/settings/calendar/DisconnectCalendarButton.tsx`
- Add calendar card to `src/app/(dashboard)/settings/page.tsx`

---

## Story 3 — Google Calendar: per-teacher connection

- `src/app/(dashboard)/teacher/calendar-connect/page.tsx`: teacher-accessible page (connect / disconnect)
- `src/app/(dashboard)/teacher/calendar-connect/actions.ts`: disconnect action
- `src/app/(dashboard)/teacher/calendar-connect/DisconnectTeacherCalendarButton.tsx`

---

## Story 4 — Calendar conflict check in lesson creation

- `src/lib/google-calendar/checkCalendarConflicts.ts`: fetches tokens for both org and teacher, calls freebusy, returns `CalendarConflict[]`
- Extend `NewLessonState` with `needsCalendarConfirm?: boolean` and `calendarConflicts?: CalendarConflict[]`
- Inject conflict check into `src/app/(dashboard)/lessons/new/actions.ts` (admin/owner flow)
- Inject conflict check into `src/app/(dashboard)/teacher/new-lesson/actions.ts` (teacher flow)
- Pattern: same as `needsAvailabilityConfirm` — form field `confirm_calendar_conflict=1` bypasses the check

---

## New env vars

```
GOOGLE_CALENDAR_ENCRYPTION_KEY=   # 64-char hex, generate with: openssl rand -hex 32
```

(Existing `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are reused — same Google Cloud project.)

---

## Out of scope

- Facebook OAuth login
- Two-way Calendar sync (write events back to Google)
- Real-time calendar polling / webhooks
- Google Calendar for parent portal
