import { AdminHeader } from '@/components/admin/AdminHeader'
import { BillingReadinessTable } from '@/components/admin/BillingReadinessTable'
import { getBillingReadiness } from '@/lib/superadmin/billing'

/**
 * Billing readiness page — superadmin only.
 * Shows per-org payment/receipt setup and revenue totals.
 * Does NOT implement subscriptions, plans, or Stripe.
 * Per /docs/sprint-18-scope.md § Story 7.
 */
export default async function AdminBillingPage() {
  const rows = await getBillingReadiness()

  return (
    <div className="max-w-5xl mx-auto">
      <AdminHeader
        title="בילינג"
        description="מוכנות ארגונים לעבור לחיוב מנויים (Sprint 21)"
      />
      <BillingReadinessTable rows={rows} />
    </div>
  )
}
