import Link from 'next/link'

import { getTranslations } from 'next-intl/server'

import { AuthEntryColumn } from '@/components/auth/AuthEntryColumn'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'

async function ForgotPasswordColumn() {
  const t = await getTranslations('auth.forgotPassword')

  return (
    <AuthEntryColumn
      title={t('title')}
      cardAlign="center"
      card={
        <>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{t('body')}</p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-11 w-full max-w-sm items-center justify-center rounded-lg border-0 bg-gradient-to-l from-teal-600 via-emerald-600 to-violet-600 px-4 text-base font-semibold text-white shadow-lg shadow-teal-600/20 transition-[filter,box-shadow] hover:brightness-105 hover:shadow-lg hover:shadow-violet-500/25"
          >
            {t('backToLogin')}
          </Link>
        </>
      }
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

export default function ForgotPasswordPage() {
  return (
    <AuthSplitShell>
      <ForgotPasswordColumn />
    </AuthSplitShell>
  )
}
