'use server'

/**
 * Server actions for the integrations settings screen. Owner-only.
 *
 * createApiKeyAction returns the plaintext key in its result. That is the only
 * time it exists anywhere — the row stores a sha256 digest — so the caller must
 * show it to the owner immediately. Nothing here logs it.
 */

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { commonError } from '@/lib/i18n/actionErrors'
import { createApiKey, revokeApiKey } from '@/lib/api/store'
import { isApiScope, type ApiScope } from '@/lib/api/keys'

export type CreateApiKeyResult = {
  error: string | null
  /** Present only on success, and only on this one response. */
  plaintext?: string
  prefix?: string
  name?: string
}

export type RevokeApiKeyResult = {
  error: string | null
}

export async function createApiKeyAction(
  _prevState: CreateApiKeyResult,
  formData: FormData
): Promise<CreateApiKeyResult> {
  const t = await getTranslations('settings.integrations')
  const session = await getSession()
  requireMutation(session)

  if (session.role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  // requireFeature redirects, so it must stay outside any try/catch.
  await requireFeature(session.orgId, 'integrations')

  const name = String(formData.get('name') ?? '').trim()
  if (!name) {
    return { error: t('errors.nameRequired') }
  }
  if (name.length > 60) {
    return { error: t('errors.nameTooLong') }
  }

  const scopes = formData.getAll('scopes').map(String).filter(isApiScope) as ApiScope[]
  if (scopes.length === 0) {
    return { error: t('errors.scopeRequired') }
  }

  try {
    const created = await createApiKey({
      orgId: session.orgId,
      name,
      scopes,
      createdBy: session.profileId,
    })

    revalidatePath('/settings/integrations')
    return {
      error: null,
      plaintext: created.plaintext,
      prefix: created.prefix,
      name: created.name,
    }
  } catch (err) {
    console.error('[settings/integrations] create failed', { orgId: session.orgId, err })
    return { error: t('errors.createFailed') }
  }
}

export async function revokeApiKeyAction(
  _prevState: RevokeApiKeyResult,
  formData: FormData
): Promise<RevokeApiKeyResult> {
  const t = await getTranslations('settings.integrations')
  const session = await getSession()
  requireMutation(session)

  if (session.role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(session.orgId, 'integrations')

  const keyId = String(formData.get('keyId') ?? '').trim()
  if (!keyId) {
    return { error: t('errors.revokeFailed') }
  }

  try {
    // Scoped to this org inside revokeApiKey, so a forged id from another org
    // simply finds nothing.
    const revoked = await revokeApiKey(session.orgId, keyId)
    if (!revoked) {
      return { error: t('errors.revokeFailed') }
    }
  } catch (err) {
    console.error('[settings/integrations] revoke failed', { orgId: session.orgId, keyId, err })
    return { error: t('errors.revokeFailed') }
  }

  revalidatePath('/settings/integrations')
  return { error: null }
}
