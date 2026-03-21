import { verifyBookingToken, BookingTokenError } from '@/lib/jwt'
import { BookingFlow } from '@/components/booking/BookingFlow'

interface BookPageProps {
  params: Promise<{ token: string }>
}

export default async function BookPage({ params }: BookPageProps) {
  const { token } = await params

  try {
    const payload = await verifyBookingToken(token)
    return <BookingFlow token={token} payload={payload} />
  } catch (err) {
    const isExpired = err instanceof BookingTokenError && err.reason === 'expired'

    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl" aria-hidden="true">⏱️</div>
          <h1 className="text-xl font-semibold text-foreground">
            {isExpired ? 'הקישור פג תוקף' : 'קישור לא תקין'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isExpired
              ? 'תוקף הקישור לקביעת השיעור פג. אנא שלח/י הודעה ב-WhatsApp כדי לקבל קישור חדש.'
              : 'הקישור אינו תקין. אנא שלח/י הודעה ב-WhatsApp כדי לקבל קישור חדש.'}
          </p>
        </div>
      </main>
    )
  }
}
