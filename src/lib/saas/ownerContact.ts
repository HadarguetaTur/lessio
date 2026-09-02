/**
 * Who to tell about an org's Lessio subscription.
 *
 * `profiles` has no email column — the address lives on auth.users, so it is
 * read through the admin API. Locale follows the organization (the owner
 * chose it), not the parent-facing bot locale.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'

export interface OwnerContact {
  profileId: string
  fullName: string
  email: string | null
  phone: string | null
  orgName: string
  locale: AppLocale
}

export async function getOwnerContact(orgId: string): Promise<OwnerContact | null> {
  const db = createServiceRoleClient()

  const [{ data: owner }, { data: org }] = await Promise.all([
    db
      .from('profiles')
      .select('id, full_name, phone')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    db.from('organizations').select('name, default_locale').eq('id', orgId).maybeSingle(),
  ])

  if (!owner || !org) return null

  let email: string | null = null
  try {
    const { data } = await db.auth.admin.getUserById(owner.id)
    email = data.user?.email ?? null
  } catch (e) {
    console.error('[saas/ownerContact] auth lookup failed', {
      orgId,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  return {
    profileId: owner.id,
    fullName: owner.full_name,
    email,
    phone: owner.phone ?? null,
    orgName: org.name,
    locale: parseAppLocale(org.default_locale ?? undefined),
  }
}
