import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { AuthEntryColumn } from '@/components/auth/AuthEntryColumn'
import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { VerifyEmailCard } from './VerifyEmailCard'

interface Props {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { email } = await searchParams
  if (!email) redirect('/signup')

  const t = await getTranslations('auth.signup.verify')

  return (
    <AuthSplitShell>
      <AuthEntryColumn
        title={t('title')}
        card={<VerifyEmailCard email={decodeURIComponent(email)} />}
        footer={
          <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
            <Link
              href="/login"
              className="font-semibold text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
            >
              {t('backToLogin')}
            </Link>
          </p>
        }
      />
    </AuthSplitShell>
  )
}
