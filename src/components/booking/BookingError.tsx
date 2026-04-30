'use client'

const ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  lock_expired: {
    title: 'המועד כבר לא שמור',
    body: 'חלף הזמן שנשמר לכם להשלמת ההזמנה. אפשר לבחור שעה חדשה ולהמשיך.',
  },
  inactive_participant: {
    title: 'אי אפשר להשלים את ההזמנה כרגע',
    body: 'כרגע לא ניתן לקבוע את השיעור הזה. מומלץ ליצור קשר עם המרכז ונשמח לעזור.',
  },
  no_primary_parent: {
    title: 'חסרים פרטים להשלמת ההזמנה',
    body: 'לא הצלחנו לאתר הורה ראשי לצורך ההזמנה. מומלץ ליצור קשר עם המרכז.',
  },
  token_expired: {
    title: 'הקישור פג תוקף',
    body: 'כדי להמשיך, שלחו הודעה ב־WhatsApp ונשלח לכם קישור חדש.',
  },
  unknown: {
    title: 'משהו השתבש בדרך',
    body: 'לא הצלחנו להשלים את הפעולה כרגע. אפשר לנסות שוב, ואם צריך ליצור קשר עם המרכז.',
  },
}

interface BookingErrorProps {
  errorCode: string
  onRestart: () => void
}

export function BookingError({ errorCode, onRestart }: BookingErrorProps) {
  const msg = ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.unknown
  const canRestart = errorCode !== 'token_expired'

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-5xl" aria-hidden="true">⚠️</div>
        <h1 className="text-xl font-semibold">{msg.title}</h1>
        <p className="text-muted-foreground text-sm">{msg.body}</p>
        {canRestart && (
          <button
            onClick={onRestart}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold"
          >
            חזרה לתחילת התהליך
          </button>
        )}
      </div>
    </main>
  )
}
