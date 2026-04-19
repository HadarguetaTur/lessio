'use server'

/**
 * Server actions for student profile page.
 * Goals CRUD. Per /docs/sprint-24-scope.md § Story 3 + 4.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createGoal, updateGoal, deleteGoal } from '@/lib/goals'
import type { GoalStatus } from '@/lib/goals'

export type GoalActionState = { error: string | null; success?: boolean }

const GoalSchema = z.object({
  studentId:   z.string().uuid(),
  subject:     z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  targetDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function createGoalAction(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = GoalSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const { studentId, subject, description, targetDate } = parsed.data

  try {
    await createGoal({
      orgId: session.orgId,
      studentId,
      createdBy: session.profileId,
      subject,
      description,
      targetDate,
    })
    revalidatePath(`/students/${studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה ביצירת המטרה' }
  }
}

const UpdateStatusSchema = z.object({
  goalId:    z.string().uuid(),
  studentId: z.string().uuid(),
  status:    z.enum(['active', 'achieved', 'abandoned']),
})

export async function updateGoalStatusAction(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = UpdateStatusSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  const { goalId, studentId, status } = parsed.data

  try {
    await updateGoal({ orgId: session.orgId, goalId, status: status as GoalStatus })
    revalidatePath(`/students/${studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בעדכון המטרה' }
  }
}

const DeleteGoalSchema = z.object({
  goalId:    z.string().uuid(),
  studentId: z.string().uuid(),
})

export async function deleteGoalAction(
  _prev: GoalActionState,
  formData: FormData
): Promise<GoalActionState> {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin') {
    return { error: 'אין הרשאה' }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = DeleteGoalSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  try {
    await deleteGoal(session.orgId, parsed.data.goalId)
    revalidatePath(`/students/${parsed.data.studentId}`)
    return { error: null, success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה במחיקת המטרה' }
  }
}
