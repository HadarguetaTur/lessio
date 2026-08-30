'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { ParentSearchSelect } from './ParentSearchSelect'
import { fetchOrgParents } from '@/app/(dashboard)/students/actions'
import { cn } from '@/lib/utils'
import type { StudentStatus } from '@/lib/students'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface StudentFormProps {
  action: FormAction
  teachers?: { id: string; full_name: string }[]
  variant?: 'create' | 'edit'
  defaultValues?: {
    full_name?: string
    grade?: string | null
    notes?: string | null
    phone?: string | null
    level?: string | null
    focused_subject?: string | null
    weekly_quota?: number | null
    status?: StudentStatus
    teacher_id?: string | null
  }
  onSuccess?: () => void
  onCancel?: () => void
  /** Hidden when the org does not enforce the weekly quota. */
  showWeeklyQuota?: boolean
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function StudentForm({
  action,
  teachers = [],
  variant = 'create',
  defaultValues,
  onSuccess,
  onCancel,
  showWeeklyQuota = true,
}: StudentFormProps) {
  const t = useTranslations('students')
  const tCommon = useTranslations('common')
  const tParents = useTranslations('parents')
  const didSubmitRef = useRef(false)
  const [state, formAction, pending] = useActionState(action, null)

  const [addParent, setAddParent] = useState(false)
  const [parentMode, setParentMode] = useState<'existing' | 'new'>('existing')
  const [selectedParentId, setSelectedParentId] = useState('')
  const [orgParents, setOrgParents] = useState<{ id: string; full_name: string; phone: string }[]>([])
  const [parentsLoaded, setParentsLoaded] = useState(false)

  useEffect(() => {
    if (variant !== 'create') return
    fetchOrgParents().then((r) => {
      if ('data' in r) setOrgParents(r.data)
      setParentsLoaded(true)
    })
  }, [variant])

  useEffect(() => {
    if (didSubmitRef.current && !pending && !state?.error) {
      onSuccess?.()
    }
  }, [state, pending, onSuccess])

  const statusDefault = defaultValues?.status ?? 'active'
  const teacherDefault = defaultValues?.teacher_id ?? ''

  return (
    <form
      action={formAction}
      onSubmit={() => {
        didSubmitRef.current = true
      }}
      className="space-y-5"
    >
      {state?.error && (
        <div className="flex items-start gap-2.5 text-sm text-destructive bg-destructive/5 border border-destructive/20 p-3 rounded-lg">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="full_name">
          {t('fields.fullName')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={defaultValues?.full_name ?? ''}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone">{t('fields.phone')}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            placeholder="0501234567"
            defaultValue={defaultValues?.phone ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="grade">{t('fields.grade')}</Label>
          <Input
            id="grade"
            name="grade"
            type="text"
            defaultValue={defaultValues?.grade ?? ''}
          />
        </div>
      </div>

      {/* Everything past name/phone/grade is either optional or has a sensible
          default. Adding a student mid-week should not mean answering eight
          questions, so the rest folds away — open by default when editing,
          where the values already exist and hiding them would hide data. */}
      <details className="group rounded-lg border border-border" open={variant !== 'create'}>
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-foreground marker:content-none">
          <span className="flex items-center gap-1.5">
            <ChevronRight
              size={14}
              className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90 rtl:-scale-x-100"
            />
            {t('moreDetails')}
          </span>
        </summary>

        <div className="space-y-4 border-t border-border p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="level">{t('fields.level')}</Label>
              <Input
                id="level"
                name="level"
                type="text"
                defaultValue={defaultValues?.level ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="focused_subject">{t('fields.focusedSubject')}</Label>
              <Input
                id="focused_subject"
                name="focused_subject"
                type="text"
                defaultValue={defaultValues?.focused_subject ?? ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {showWeeklyQuota && (
              <div className="space-y-1.5">
                <Label htmlFor="weekly_quota">{t('fields.weeklyQuota')}</Label>
                <Input
                  id="weekly_quota"
                  name="weekly_quota"
                  type="number"
                  min={1}
                  max={10}
                  placeholder="1–10"
                  defaultValue={defaultValues?.weekly_quota ?? ''}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="status">{t('fields.status')}</Label>
              <select
                id="status"
                name="status"
                defaultValue={statusDefault}
                className={selectClass}
              >
                <option value="active">{t('status.active')}</option>
                <option value="on_hold">{t('status.on_hold')}</option>
                <option value="inactive">{t('status.inactive')}</option>
              </select>
            </div>
          </div>

          {teachers.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="teacher_id">{t('fields.teacher')}</Label>
              <select
                id="teacher_id"
                name="teacher_id"
                defaultValue={teacherDefault}
                className={selectClass}
              >
                <option value="">{t('fields.noTeacher')}</option>
                {teachers.map((teach) => (
                  <option key={teach.id} value={teach.id}>
                    {teach.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* One teacher: assign silently instead of offering a choice of one. */}
          {teachers.length === 1 && (
            <input type="hidden" name="teacher_id" value={teacherDefault || teachers[0].id} />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">{t('fields.notes')}</Label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={defaultValues?.notes ?? ''}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </div>
      </details>

      {variant === 'create' ? (
        <section
          className={cn(
            'rounded-xl border border-border bg-muted/20 p-4 space-y-4',
            addParent && 'bg-card',
          )}
        >
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
            <input
              type="checkbox"
              name="add_parent"
              value="on"
              checked={addParent}
              onChange={(e) => setAddParent(e.target.checked)}
            />
            {t('intake.addParent')}
          </label>

          {addParent ? (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="flex gap-4 text-sm" role="radiogroup">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="parent_mode_radio"
                    checked={parentMode === 'existing'}
                    onChange={() => setParentMode('existing')}
                  />
                  {t('intake.existingParent')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="parent_mode_radio"
                    checked={parentMode === 'new'}
                    onChange={() => setParentMode('new')}
                  />
                  {t('intake.newParent')}
                </label>
              </div>
              <input type="hidden" name="parent_mode" value={parentMode} />

              {parentMode === 'existing' ? (
                <div className="space-y-1.5">
                  <Label>{t('intake.pickExistingParent')}</Label>
                  {parentsLoaded ? (
                    <ParentSearchSelect parents={orgParents} value={selectedParentId} onChange={setSelectedParentId} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('intake.loadingParents')}</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new_parent_full_name">
                      {t('intake.parentName')} <span className="text-destructive">*</span>
                    </Label>
                    <Input id="new_parent_full_name" name="new_parent_full_name" type="text" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new_parent_phone">
                      {tParents('fields.phone')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="new_parent_phone"
                      name="new_parent_phone"
                      type="tel"
                      dir="ltr"
                      placeholder="0501234567"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new_parent_email">{tParents('fields.email')}</Label>
                    <Input
                      id="new_parent_email"
                      name="new_parent_email"
                      type="email"
                      dir="ltr"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new_parent_relation">{tParents('fields.relationType')}</Label>
                    <select
                      id="new_parent_relation"
                      name="new_parent_relation_type"
                      defaultValue=""
                      className={selectClass}
                    >
                      <option value="">{tParents('fields.relationTypeUnset')}</option>
                      <option value="mother">{tParents('fields.relationTypeMother')}</option>
                      <option value="father">{tParents('fields.relationTypeFather')}</option>
                      <option value="guardian">{tParents('fields.relationTypeGuardian')}</option>
                      <option value="other">{tParents('fields.relationTypeOther')}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        name="new_parent_whatsapp_consent"
                        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                      />
                      <span>{tParents('consent.checkbox')}</span>
                    </label>
                    <p className="text-xs text-muted-foreground">{tParents('consent.checkboxHint')}</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        {onCancel ? (
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel}>
            {tCommon('actions.cancel')}
          </Button>
        ) : (
          <Link href="/students" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full">
              {tCommon('actions.cancel')}
            </Button>
          </Link>
        )}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? tCommon('actions.saving') : tCommon('actions.save')}
        </Button>
      </div>
    </form>
  )
}
