import Link from 'next/link'

import { getTranslations } from 'next-intl/server'

import { AuthEntryColumn } from '@/components/auth/AuthEntryColumn'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { LoginSocialButtons } from '@/components/auth/LoginSocialButtons'
import { LoginForm } from './LoginForm'

async function FormColumn() {
  const t = await getTranslations('auth.login')

  return (
    <AuthEntryColumn
      title={t('title')}
      card={<LoginForm />}
      afterCard={
        <>
          <div className="relative my-9 mx-auto flex w-full max-w-sm items-center gap-3">
            <span className="h-px flex-1 bg-border/90" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{t('divider')}</span>
            <span className="h-px flex-1 bg-border/90" />
          </div>
          <div className="mx-auto w-full max-w-sm">
            <LoginSocialButtons />
          </div>
        </>
      }
      footer={
        <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
          {t('noAccount')}{' '}
          <Link
            href="/signup"
            className="font-semibold text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
          >
            {t('signupLink')}
          </Link>
        </p>
      }
    />
  )
}

export default function LoginPage() {
  return (
    <AuthSplitShell>
      <FormColumn />
    </AuthSplitShell>
  )
}
