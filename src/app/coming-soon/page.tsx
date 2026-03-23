import { signOut } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'

export default function ComingSoonPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">בקרוב</h1>
        <p className="text-gray-500 mb-8">פורטל המורים יהיה זמין בקרוב.</p>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            יציאה
          </Button>
        </form>
      </div>
    </main>
  )
}
