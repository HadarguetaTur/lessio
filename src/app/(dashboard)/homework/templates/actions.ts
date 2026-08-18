'use server'

/**
 * Server actions for homework template CRUD.
 * Per /docs/sprint-14-scope.md § Story 3.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { createTemplate, updateTemplate, deleteTemplate } from '@/lib/homework'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type ActionState = {
  error: string | null
  success?: boolean
}

const TemplateSchema = z.object({
  title:   z.string().min(1, 'validation.titleRequired').max(200),
  subject: z.string().max(100).optional(),
  body:    z.string().min(1, 'validation.bodyRequired').max(2000),
})

export async function createTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role, profileId } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'homework')

  const raw = {
    title:   formData.get('title'),
    subject: formData.get('subject') || undefined,
    body:    formData.get('body'),
  }

  const parsed = TemplateSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  try {
    await createTemplate({
      orgId,
      title:     parsed.data.title,
      subject:   parsed.data.subject,
      body:      parsed.data.body,
      createdBy: profileId,
    })
    revalidatePath('/homework/templates')
    return { error: null, success: true }
  } catch (err) {
    console.error('[homework/templates] createTemplateAction failed', { orgId, err })
    return { error: t('homework.errors.createTemplateFailed') }
  }
}

export async function updateTemplateAction(
  templateId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'homework')

  const raw = {
    title:   formData.get('title'),
    subject: formData.get('subject') || undefined,
    body:    formData.get('body'),
  }

  const parsed = TemplateSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  try {
    await updateTemplate({
      orgId,
      templateId,
      title:   parsed.data.title,
      subject: parsed.data.subject,
      body:    parsed.data.body,
    })
    revalidatePath('/homework/templates')
    return { error: null, success: true }
  } catch (err) {
    console.error('[homework/templates] updateTemplateAction failed', { orgId, templateId, err })
    return { error: t('homework.errors.updateTemplateFailed') }
  }
}

export async function deleteTemplateAction(
  templateId: string
): Promise<{ error?: string }> {
  const t = await getTranslations()
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: await commonError('noPermission') }
  }

  await requireFeature(orgId, 'homework')

  try {
    await deleteTemplate(orgId, templateId)
    revalidatePath('/homework/templates')
    return {}
  } catch (err) {
    console.error('[homework/templates] deleteTemplateAction failed', { orgId, templateId, err })
    return { error: t('homework.errors.deleteTemplateFailed') }
  }
}
