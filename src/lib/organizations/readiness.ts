import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Whether an org is actually live, or merely signed up.
 *
 * The audit found that nothing in the product distinguished the two: a tenant
 * with no WhatsApp number, no AI key and no payment provider saw exactly the
 * same dashboard as a fully configured one, and never learned that none of its
 * automatic messages were going out.
 *
 * SERVER-ONLY in practice — it reads process.env.OPENAI_API_KEY. Never import
 * this from src/lib/navigation/registry.ts or from any client component.
 */

export type OrgReadinessRow = {
  whatsapp_phone_number_id: string | null
  ai_provider: string | null
  ai_config_encrypted: string | null
  payment_config_encrypted: string | null
}

export type OrgReadiness = {
  hasWhatsApp: boolean
  hasAi: boolean
  hasPayment: boolean
  isReady: boolean
}

export type OrgSetupProgress = OrgReadiness & {
  hasTeacher: boolean
  hasStudent: boolean
  hasLesson: boolean
}

/**
 * Pure half, so the rules can be tested without a database.
 *
 * `hasAi` deliberately restates the rule in isAiConfiguredForOrg
 * (src/lib/ai-assistant/providers/factory.ts): an org key, or the platform
 * OpenAI key when the provider is openai. Duplicated on purpose — this lets the
 * dashboard answer all three questions in one four-column query instead of two
 * round trips. If the rule there changes, change it here too.
 */
export function computeOrgReadiness(
  row: OrgReadinessRow | null,
  opts: { platformOpenAiKey: boolean }
): OrgReadiness {
  const hasWhatsApp = Boolean(row?.whatsapp_phone_number_id)
  const hasPayment = Boolean(row?.payment_config_encrypted)

  const provider = row?.ai_provider ?? 'openai'
  const hasAi = row
    ? Boolean(row.ai_config_encrypted) ||
      (provider === 'openai' && opts.platformOpenAiKey)
    : false

  return {
    hasWhatsApp,
    hasAi,
    hasPayment,
    isReady: hasWhatsApp && hasAi && hasPayment,
  }
}

/** One query, four columns. Never throws — a failed read reads as "not ready". */
export async function getOrgReadiness(orgId: string): Promise<OrgReadiness> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('organizations')
    .select(
      'whatsapp_phone_number_id, ai_provider, ai_config_encrypted, payment_config_encrypted'
    )
    .eq('id', orgId)
    .maybeSingle()

  return computeOrgReadiness((data as OrgReadinessRow | null) ?? null, {
    platformOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
  })
}

/** Setup facts derived from real product data, never browser state. */
export async function getOrgSetupProgress(orgId: string): Promise<OrgSetupProgress> {
  const db = createServiceRoleClient()
  const [readiness, teachers, students, lessons] = await Promise.all([
    getOrgReadiness(orgId),
    db.from('teachers').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
    db.from('students').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
    db.from('lessons').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
  ])

  return {
    ...readiness,
    hasTeacher: (teachers.count ?? 0) > 0,
    hasStudent: (students.count ?? 0) > 0,
    hasLesson: (lessons.count ?? 0) > 0,
  }
}
