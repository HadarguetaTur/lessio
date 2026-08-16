import { getTranslations } from 'next-intl/server'

import { verifyBookingToken, BookingTokenError } from '@/lib/jwt'
import { BookingFlow } from '@/components/booking/BookingFlow'

interface BookPageProps {
  params: Promise<{ token: string }>
}

export default async function BookPage({ params }: BookPageProps) {
  const { token } = await params
  let payload: Awaited<ReturnType<typeof verifyBookingToken>> | null = null
  let isExpired = false

  try {
    payload = await verifyBookingToken(token)
  } catch (err) {
    isExpired = err instanceof BookingTokenError && err.reason === 'expired'
  }

  if (payload) {
    return <BookingFlow token={token} payload={payload} />
  }

  const t = await getTranslations('booking.link')

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl" aria-hidden="true">⏱️</div>
        <h1 className="text-xl font-semibold text-foreground">
          {isExpired ? t('expiredTitle') : t('invalidTitle')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {isExpired ? t('expiredBody') : t('invalidBody')}
        </p>
      </div>
    </main>
  )
}
