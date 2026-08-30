import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

export default async function SettingsPage() {
  const { role } = await getSession()
  if (role !== 'owner' && role !== 'admin') redirect('/dashboard')
  redirect('/settings/business')
}
