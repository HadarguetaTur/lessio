import { getSession } from '@/lib/auth/session'
import { getCancellationPolicyOrDefaults } from '@/lib/cancellation-policy'
import { CancellationPolicyForm } from '@/components/dashboard/settings/CancellationPolicyForm'
import { updateCancellationPolicy } from './actions'

export default async function CancellationPolicyPage() {
  const { orgId, role } = await getSession()
  const { policy, values } = await getCancellationPolicyOrDefaults(orgId)
  const isOwner = role === 'owner'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">מדיניות ביטולים</h1>
      <p className="text-sm text-gray-500 mb-6">
        הגדרת כללי חיוב בעת ביטול שיעור — תקף לכל הארגון
      </p>

      {!policy && (
        <div className="mb-5 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md">
          לא הוגדרה מדיניות ביטולים. מוצגים ערכי ברירת מחדל — שמור כדי לאשר אותם.
        </div>
      )}

      {!isOwner && (
        <div className="mb-5 text-sm text-gray-600 bg-gray-50 border border-gray-200 p-3 rounded-md">
          צפייה בלבד — רק בעל העסק יכול לעדכן את המדיניות
        </div>
      )}

      <CancellationPolicyForm
        action={updateCancellationPolicy}
        defaultValues={values}
        readOnly={!isOwner}
      />
    </div>
  )
}
