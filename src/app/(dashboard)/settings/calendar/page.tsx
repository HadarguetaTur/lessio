import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CheckCircle, AlertCircle, CalendarDays } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { listCalendars, resolveSelectedCalendars, CalendarListEntry } from '@/lib/google-calendar'
import { CalendarSelectionCard } from '@/components/dashboard/settings/CalendarSelectionCard'
import { DisconnectCalendarButton } from './DisconnectCalendarButton'
import { updateOrgCalendarSelection } from './actions'

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const { orgId, role } = await getSession()
  if (role !== 'owner') forbidden()

  const t = await getTranslations('settings.calendarPage')
  const tErr = await getTranslations('settings.googleOAuthErrors')

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('google_calendar_email, google_calendar_refresh_token, google_calendar_selected_calendars')
    .eq('id', orgId)
    .single()

  const connectedEmail = org?.google_calendar_email ?? null
  const isConnected    = Boolean(connectedEmail)

  let calendarList: CalendarListEntry[] | null = null
  if (isConnected && org?.google_calendar_refresh_token) {
    try {
      calendarList = await listCalendars(org.google_calendar_refresh_token)
    } catch (err) {
      console.error('[settings/calendar] calendarList fetch failed', { err })
    }
  }
  const selectedCalendars = resolveSelectedCalendars(org?.google_calendar_selected_calendars)

  const params         = await searchParams
  const justConnected  = params.connected === '1'
  const errorCode      = params.error ?? null

  const canConnect = Boolean(process.env.GOOGLE_CLIENT_ID)

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-1">
        <CalendarDays size={22} className="text-primary" />
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">{t('subtitle')}</p>

      {justConnected && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {t('connectedBanner')}
        </div>
      )}

      {errorCode && !justConnected && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {ERROR_KEYS.includes(errorCode) ? tErr(errorCode) : tErr('generic')}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected ? (
          <ConnectedState email={connectedEmail!} />
        ) : (
          <DisconnectedState canConnect={canConnect} />
        )}
      </div>

      {isConnected && (
        <CalendarSelectionCard
          calendars={calendarList}
          selected={selectedCalendars}
          listError={calendarList === null}
          saveAction={updateOrgCalendarSelection}
        />
      )}

      <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">{t('howTitle')}</p>
        <ul className="list-disc list-inside text-blue-700 space-y-0.5">
          <li>{t('how1')}</li>
          <li>{t('how2')}</li>
          <li>{t('how3')}</li>
        </ul>
      </div>
    </div>
  )
}

async function ConnectedState({ email }: { email: string }) {
  const t = await getTranslations('settings.calendarPage')
  const tG = await getTranslations('settings.googleCommon')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">{tG('connected')}</span>
      </div>

      <dl className="text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('accountLabel')}</dt>
          <dd className="font-mono text-gray-900 text-xs">{email}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-muted-foreground mb-2">{t('disconnectHint')}</p>
        <DisconnectCalendarButton />
      </div>
    </div>
  )
}

async function DisconnectedState({ canConnect }: { canConnect: boolean }) {
  const t = await getTranslations('settings.calendarPage')
  const tG = await getTranslations('settings.googleCommon')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">{tG('notConnected')}</span>
      </div>

      <p className="text-sm text-gray-600">{tG('connectHint')}</p>

      {canConnect ? (
        <a
          href="/api/google-calendar/connect?target=org"
          className="inline-flex items-center gap-2 rounded-md bg-white border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <GoogleIcon />
          {t('connectButton')}
        </a>
      ) : (
        <p className="text-sm text-red-600">{tG('missingClientId')}</p>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}

/** OAuth failure codes the callback route can put in `?error=`. */
const ERROR_KEYS = [
  'denied',
  'invalid',
  'state_mismatch',
  'exchange',
  'encrypt',
  'db',
  'config',
  'forbidden',
  'unauthenticated',
  'scope',
]
