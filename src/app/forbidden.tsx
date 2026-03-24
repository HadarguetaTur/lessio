import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6" dir="rtl">
      <div className="max-w-md w-full rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">אין הרשאה</h1>
        <p className="mt-3 text-sm text-gray-600">
          אין לך הרשאה לצפות במשאב הזה או לבצע את הפעולה שביקשת.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          חזרה ללוח
        </Link>
      </div>
    </main>
  )
}
