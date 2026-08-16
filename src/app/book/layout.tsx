/**
 * Booking WebView shell.
 * The root layout body is `overflow-hidden`, so every route group must provide
 * its own scroll container — without this, anything below the first viewport
 * is clipped and unreachable on mobile.
 */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-background" dir="rtl">
      {children}
    </div>
  )
}
