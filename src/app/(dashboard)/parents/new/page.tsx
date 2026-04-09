import { ParentForm } from '@/components/dashboard/parents/ParentForm'
import { createParent } from '../actions'
import { getTranslations } from 'next-intl/server'

export default async function NewParentPage() {
  const t = await getTranslations('parents')
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('newParent')}</h1>
      <ParentForm action={createParent} />
    </div>
  )
}
