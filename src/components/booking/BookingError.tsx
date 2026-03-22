'use client'

const ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  lock_expired: {
    title: 'פג הזמן לשמירת המקום',
    body: 'הזמן לאישור השיעור פג. אנא בחר/י שעה מחדש.',
  },
  inactive_participant: {
    title: 'שגיאה בהזמנה',
    body: 'לא ניתן לקבוע שיעור כרגע. אנא צור/י קשר עם המרכז.',
  },
  no_primary_parent: {
    title: 'שגיאה בהזמנה',
    body: 'לא נמצא פרטי הורה ראשי. אנא צור/י קשר עם המרכז.',
  },
  token_expired: {
    title: 'הקישור פג תוקף',
    body: 'אנא שלח/י הודעה ב-WhatsApp כדי לקבל קישור חדש.',
  },
  unknown: {
    title: 'שגיאה לא צפויה',
    body: 'אירעה שגיאה. אנא נסה/י שוב או צור/י קשר עם המרכז.',
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
            התחל/י מחדש
          </button>
        )}
      </div>
    </main>
  )
}
