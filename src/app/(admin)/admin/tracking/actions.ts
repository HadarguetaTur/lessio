'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import { recordAdminAction } from '@/lib/superadmin/audit'
import {
  TRACKING_PROVIDERS,
  deleteDestination,
  saveDestination,
  type TrackingProvider,
} from '@/lib/tracking/destinations'
import { trackEvent } from '@/lib/tracking/events'

/**
 * Tracking destination management for /admin/tracking.
 * Per /docs/sprint-34-scope.md § C.
 */

export type TrackingActionState = { error?: string; ok?: boolean; message?: string }

const schema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum(TRACKING_PROVIDERS as unknown as [TrackingProvider, ...TrackingProvider[]]),
  label: z.string().trim().min(2).max(60),
  externalId: z.string().trim().min(3).max(120),
  // Absent leaves the stored credential untouched; an explicit empty string
  // clears it. A form that always sent '' would wipe the token on every save.
  serverCredential: z.string().optional(),
  testEventCode: z.string().trim().max(60).optional(),
  consentCategory: z.enum(['necessary', 'analytics', 'marketing']),
  isEnabled: z.coerce.boolean(),
})

export async function saveDestinationAction(
  _prev: TrackingActionState | null,
  formData: FormData
): Promise<TrackingActionState> {
  const session = await requirePlatformSession('growth.write')

  const rawCredential = formData.get('serverCredential')
  const parsed = schema.safeParse({
    id: formData.get('id') || undefined,
    provider: formData.get('provider'),
    label: formData.get('label'),
    externalId: formData.get('externalId'),
    serverCredential: typeof rawCredential === 'string' && rawCredential !== '' ? rawCredential : undefined,
    testEventCode: formData.get('testEventCode') ?? '',
    consentCategory: formData.get('consentCategory'),
    isEnabled: formData.get('isEnabled') === 'on',
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await saveDestination({
    ...parsed.data,
    testEventCode: parsed.data.testEventCode?.trim() || null,
  })
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'tracking.destination_save',
    targetType: 'tracking_destinations',
    targetId: result.id,
    metadata: {
      provider: parsed.data.provider,
      enabled: parsed.data.isEnabled,
      credentialChanged: parsed.data.serverCredential !== undefined,
    },
  })

  revalidatePath('/admin/tracking')
  return { ok: true }
}

const deleteSchema = z.object({ id: z.string().uuid() })

export async function deleteDestinationAction(
  _prev: TrackingActionState | null,
  formData: FormData
): Promise<TrackingActionState> {
  const session = await requirePlatformSession('growth.write')

  const parsed = deleteSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await deleteDestination(parsed.data.id)
  if (!result.ok) return { error: result.error }

  await recordAdminAction({
    actorProfileId: session.profileId,
    action: 'tracking.destination_delete',
    targetType: 'tracking_destinations',
    targetId: parsed.data.id,
  })

  revalidatePath('/admin/tracking')
  return { ok: true }
}

/**
 * Fires a real Lead event through the full server-side path.
 *
 * The only honest way to answer "is this configured correctly" — a form that
 * merely validates the shape of a token would pass for a revoked one.
 */
export async function sendTestEventAction(
  _prev: TrackingActionState | null,
  _formData: FormData
): Promise<TrackingActionState> {
  await requirePlatformSession('growth.write')

  const { eventId } = await trackEvent({
    event: 'Lead',
    visitorId: `test-${Date.now()}`,
    sourceUrl: '/admin/tracking',
  })

  revalidatePath('/admin/tracking')
  return { ok: true, message: eventId }
}
