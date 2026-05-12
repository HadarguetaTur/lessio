import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { AuthEntryColumn } from '@/components/auth/AuthEntryColumn'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { ResetPasswordForm } from './ResetPasswordForm'

async function ResetPasswordColumn() {
  const t = await getTranslations('auth.resetPassword')

  return (
    <AuthEntryColumn
      title={t('title')}
      card={<ResetPasswordForm />}
      footer={
        <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
          {t('remember')}{' '}
          <Link
            href="/login"
            className="font-semibold text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
          >
            {t('loginLink')}
          </Link>
        </p>
      }
    />
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthSplitShell>
      <ResetPasswordColumn />
    </AuthSplitShell>
  )
}
