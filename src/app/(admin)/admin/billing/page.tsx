import { redirect } from 'next/navigation'

/**
 * /admin/billing summed `charges` — money a teacher billed a parent — and
 * called it the platform's billing screen. The platform's own income now lives
 * at /admin/revenue; per-org payment readiness moved onto the org detail page
 * and the overview's attention queue.
 */
export default function AdminBillingRedirect() {
  redirect('/admin/revenue')
}
