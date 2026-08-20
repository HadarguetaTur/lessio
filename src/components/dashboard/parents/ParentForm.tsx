'use client'

import { useActionState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

type RelationType = 'mother' | 'father' | 'guardian' | 'other' | ''

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface ParentFormProps {
  action: FormAction
  defaultValues?: {
    full_name?: string
    phone?: string
    email?: string | null
    second_phone?: string | null
    address?: string | null
    relation_type?: string | null
    notes?: string | null
    /** Existing consent record (edit mode). When set, the checkbox is replaced by a summary. */
    consent_source?: string | null
    consented_at?: string | null
  }
  onSuccess?: () => void
  onCancel?: () => void
}

export function ParentForm({ action, defaultValues, onSuccess, onCancel }: ParentFormProps) {
  const t = useTranslations('parents')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const didSubmitRef = useRef(false)
  const [state, formAction, pending] = useActionState(action, null)

  const rel = (defaultValues?.relation_type ?? '') as RelationType
  const consentedAt = defaultValues?.consented_at ?? null
  const consentSource = defaultValues?.consent_source ?? null

  useEffect(() => {
    if (didSubmitRef.current && !pending && !state?.error) {
      onSuccess?.()
    }
  }, [state, pending, onSuccess])

  return (
    <form
      action={formAction}
      onSubmit={() => { didSubmitRef.current = true }}
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

      <div className="space-y-1.5">
        <Label htmlFor="phone">
          {t('fields.phone')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          dir="ltr"
          placeholder="0501234567"
          defaultValue={defaultValues?.phone ?? ''}
        />
        <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="relation_type">{t('fields.relationType')}</Label>
        <select id="relation_type" name="relation_type" defaultValue={rel} className={selectClassName}>
          <option value="">{t('fields.relationTypeUnset')}</option>
          <option value="mother">{t('fields.relationTypeMother')}</option>
          <option value="father">{t('fields.relationTypeFather')}</option>
          <option value="guardian">{t('fields.relationTypeGuardian')}</option>
          <option value="other">{t('fields.relationTypeOther')}</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('consent.label')}</Label>
        {consentedAt ? (
          <p className="text-sm text-muted-foreground">
            {t('consent.recorded', {
              date: new Date(consentedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US'),
              source: t(`consent.source.${consentSource ?? 'attested'}`),
            })}
          </p>
        ) : (
          <>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="whatsapp_consent"
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span>{t('consent.checkbox')}</span>
            </label>
            <p className="text-xs text-muted-foreground">{t('consent.checkboxHint')}</p>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t('fields.email')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          defaultValue={defaultValues?.email ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="second_phone">{t('fields.secondPhone')}</Label>
        <Input
          id="second_phone"
          name="second_phone"
          type="tel"
          dir="ltr"
          placeholder="0521234567"
          defaultValue={defaultValues?.second_phone ?? ''}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">{t('fields.address')}</Label>
        <textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={defaultValues?.address ?? ''}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

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

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon('actions.saving') : tCommon('actions.save')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>{tCommon('actions.cancel')}</Button>
        ) : (
          <Link href="/parents">
            <Button type="button" variant="outline">{tCommon('actions.cancel')}</Button>
          </Link>
        )}
      </div>
    </form>
  )
}
