import Link from 'next/link'
import { SignupForm } from './SignupForm'

export default function SignupPage() {
  return (
    <main className="min-h-screen flex" dir="rtl">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-primary p-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <span className="text-white text-sm font-bold leading-none">L</span>
          </div>
          <span className="text-white text-lg font-semibold tracking-tight">LESSIO</span>
        </div>

        <div>
          <blockquote className="text-white/90 text-xl font-medium leading-snug mb-3">
            &quot;הכל במקום אחד — שיעורים, גבייה, הורים, ו-WhatsApp.&quot;
          </blockquote>
          <p className="text-white/60 text-sm">מערכת ניהול שיעורים לעסקי הוראה</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-white text-xs font-bold">✦</span>
          </div>
          <div>
            <p className="text-white text-sm font-medium">התחל לנהל את העסק שלך</p>
            <p className="text-white/60 text-xs">הרשמה תוך דקה</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-bold leading-none">L</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">LESSIO</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">יצירת חשבון חדש</h1>
            <p className="mt-1 text-sm text-muted-foreground">הקם את מערכת ניהול השיעורים שלך</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <SignupForm />
          </div>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            כבר יש לך חשבון?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              התחברות
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
