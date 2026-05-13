'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendEmail } from '@/lib/email'

export type GmailActionResult = { error: string | null; success?: boolean }

export async function disconnectGmail(
  _prevState: GmailActionResult,
  _formData: FormData
): Promise<GmailActionResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ gmail_refresh_token: null, gmail_connected_email: null })
    .eq('id', orgId)

  if (error) {
    console.error('[gmail/settings] Disconnect failed', { orgId, error: error.message })
    return { error: 'שגיאה בניתוק החשבון' }
  }

  console.info('[gmail/settings] Gmail disconnected', { orgId })
  revalidatePath('/settings/email')
  return { error: null }
}

export async function sendTestEmail(
  _prevState: GmailActionResult,
  formData: FormData
): Promise<GmailActionResult> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') return { error: 'אין הרשאה לביצוע פעולה זו' }

  const to = (formData.get('to') as string)?.trim()
  if (!to || !to.includes('@')) return { error: 'כתובת מייל לא תקינה' }

  const ok = await sendEmail({
    orgId,
    to,
    subject: 'מייל בדיקה מ-Lessio',
    html: `<div dir="rtl" style="font-family:sans-serif;padding:24px">
      <h2>זה עובד! 🎉</h2>
      <p>המייל הזה נשלח מחשבון ה-Gmail שלך דרך Lessio.</p>
      <p style="color:#666;font-size:13px">נשלח מהגדרות → מייל</p>
    </div>`,
  })

  if (!ok) return { error: 'שליחת המייל נכשלה — בדוק שה-Gmail מחובר' }
  return { error: null, success: true }
}
