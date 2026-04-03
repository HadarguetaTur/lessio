import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">LESSIO</h1>
          <p className="mt-1 text-sm text-gray-500">מערכת ניהול שיעורים</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">התחברות</h2>
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
