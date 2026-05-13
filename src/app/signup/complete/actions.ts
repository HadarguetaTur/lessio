'use server'

import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createOrgForExistingUser } from '@/lib/auth/createOrgWithOwner'
import { z } from 'zod'

const CompleteSignupSchema = z.object({
  org_name: z.string().min(2),
  full_name: z.string().min(2),
})

export async function completeGoogleSignup(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = CompleteSignupSchema.safeParse({
    org_name: (formData.get('org_name') as string ?? '').trim(),
    full_name: (formData.get('full_name') as string ?? '').trim(),
  })

  const tVal = await getTranslations('auth.validation')
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? tVal('orgNameMin') }
  }

  const tSrv = await getTranslations('auth.signupServerErrors')
  const result = await createOrgForExistingUser(
    { ...parsed.data, userId: user.id },
    { orgFailed: tSrv('orgFailed'), profileFailed: tSrv('profileFailed') }
  )

  if (!result.success) {
    return { error: result.error }
  }

  redirect('/onboarding')
}
