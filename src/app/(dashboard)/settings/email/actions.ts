'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendEmail } from '@/lib/email'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations, getLocale } from 'next-intl/server'

export type GmailActionResult = { error: string | null; success?: boolean }

export async function disconnectGmail(
  _prevState: GmailActionResult,
  _formData: FormData
): Promise<GmailActionResult> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') return { error: await commonError('noPermission') }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ gmail_refresh_token: null, gmail_connected_email: null })
    .eq('id', orgId)

  if (error) {
    console.error('[gmail/settings] Disconnect failed', { orgId, error: error.message })
    return { error: t('settings.whatsappActions.errors.disconnectFailed') }
  }

  console.info('[gmail/settings] Gmail disconnected', { orgId })
  revalidatePath('/settings/email')
  return { error: null }
}

export async function sendTestEmail(
  _prevState: GmailActionResult,
  formData: FormData
): Promise<GmailActionResult> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') return { error: await commonError('noPermission') }

  const to = (formData.get('to') as string)?.trim()
  if (!to || !to.includes('@')) return { error: t('settings.emailActions.errors.invalidEmail') }

  const ok = await sendEmail({
    orgId,
    to,
    subject: t('settings.emailActions.testSubject'),
    html: `<div dir="${(await getLocale()) === 'he' ? 'rtl' : 'ltr'}" style="font-family:sans-serif;padding:24px">
      <h2>${t('settings.emailActions.testHeading')}</h2>
      <p>${t('settings.emailActions.testBody')}</p>
    </div>`,
  })

  if (!ok) return { error: t('settings.emailActions.errors.sendFailed') }
  return { error: null, success: true }
}
