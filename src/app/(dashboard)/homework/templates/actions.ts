'use server'

/**
 * Server actions for homework template CRUD.
 * Per /docs/sprint-14-scope.md § Story 3.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { createTemplate, updateTemplate, deleteTemplate } from '@/lib/homework'

export type ActionState = {
  error: string | null
  success?: boolean
}

const TemplateSchema = z.object({
  title:   z.string().min(1, 'כותרת נדרשת').max(200),
  subject: z.string().max(100).optional(),
  body:    z.string().min(1, 'תוכן נדרש').max(2000),
})

export async function createTemplateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { orgId, role, profileId } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  const raw = {
    title:   formData.get('title'),
    subject: formData.get('subject') || undefined,
    body:    formData.get('body'),
  }

  const parsed = TemplateSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
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
    return { error: err instanceof Error ? err.message : 'שגיאה ביצירת התבנית' }
  }
}

export async function updateTemplateAction(
  templateId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  const raw = {
    title:   formData.get('title'),
    subject: formData.get('subject') || undefined,
    body:    formData.get('body'),
  }

  const parsed = TemplateSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
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
    return { error: err instanceof Error ? err.message : 'שגיאה בעדכון התבנית' }
  }
}

export async function deleteTemplateAction(
  templateId: string
): Promise<{ error?: string }> {
  const { orgId, role } = await getSession()

  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  try {
    await deleteTemplate(orgId, templateId)
    revalidatePath('/homework/templates')
    return {}
  } catch (err) {
    console.error('[homework/templates] deleteTemplateAction failed', { orgId, templateId, err })
    return { error: err instanceof Error ? err.message : 'שגיאה במחיקת התבנית' }
  }
}
