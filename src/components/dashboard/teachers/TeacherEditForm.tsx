'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Check } from 'lucide-react'
import {
  TEACHER_COLOR_CLASSES,
  TEACHER_COLOR_KEYS,
  deriveTeacherColor,
  isTeacherColorKey,
} from '@/lib/teachers/color'
import { cn } from '@/lib/utils'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface TeacherEditFormProps {
  action: FormAction
  /** Needed to preview the derived colour behind "automatic". */
  teacherId: string
  defaultValues?: {
    bio?: string | null
    hourly_rate?: number | null
    phone?: string | null
    color?: string | null
  }
  onSuccess?: () => void
  onCancel?: () => void
}

export function TeacherEditForm({
  action,
  teacherId,
  defaultValues,
  onSuccess,
  onCancel,
}: TeacherEditFormProps) {
  const t = useTranslations('teachers')
  const tCommon = useTranslations('common')
  const didSubmitRef = useRef(false)
  const [state, formAction, pending] = useActionState(action, null)
  const storedColor = isTeacherColorKey(defaultValues?.color) ? defaultValues.color : ''
  const [color, setColor] = useState<string>(storedColor)
  const autoColor = deriveTeacherColor(teacherId)

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
        <Label htmlFor="hourly_rate">{t('fields.hourlyRate')}</Label>
        <Input
          id="hourly_rate"
          name="hourly_rate"
          type="number"
          min="0"
          step="0.01"
          defaultValue={defaultValues?.hourly_rate ?? ''}
          placeholder={t('fields.hourlyRatePlaceholder')}
        />
        {defaultValues?.hourly_rate == null && (
          <p className="text-xs text-amber-600">{t('noRateWarning')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">{t('fields.phone')}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          defaultValue={defaultValues?.phone ?? ''}
          placeholder="050-1234567"
        />
        <p className="text-xs text-muted-foreground">{t('phoneBotHint')}</p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium leading-none">{t('fields.color')}</legend>
        <div className="flex flex-wrap items-center gap-2 pt-1.5">
          {/* "Automatic" shows the colour the teacher gets without a choice. */}
          <ColorSwatch
            value=""
            checked={color === ''}
            onChange={setColor}
            swatchClass={TEACHER_COLOR_CLASSES[autoColor].swatch}
            label={t('fields.colorAuto')}
            showLabel
          />
          {TEACHER_COLOR_KEYS.map((key) => (
            <ColorSwatch
              key={key}
              value={key}
              checked={color === key}
              onChange={setColor}
              swatchClass={TEACHER_COLOR_CLASSES[key].swatch}
              label={key}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('colorHint')}</p>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="bio">{t('bio')}</Label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={defaultValues?.bio ?? ''}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        {onCancel ? (
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onCancel}>{tCommon('actions.cancel')}</Button>
        ) : (
          <Link href="/teachers" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full">{tCommon('actions.cancel')}</Button>
          </Link>
        )}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? tCommon('actions.saving') : tCommon('actions.save')}
        </Button>
      </div>
    </form>
  )
}

function ColorSwatch({
  value,
  checked,
  onChange,
  swatchClass,
  label,
  showLabel,
}: {
  value: string
  checked: boolean
  onChange: (value: string) => void
  swatchClass: string
  label: string
  showLabel?: boolean
}) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-1 py-1 text-xs transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1',
        checked ? 'border-foreground/60 bg-muted' : 'border-transparent hover:bg-muted/60'
      )}
    >
      <input
        type="radio"
        name="color"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
        aria-label={label}
      />
      <span
        aria-hidden
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-full text-white',
          swatchClass.split(' ')[0]
        )}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      {showLabel && <span className="pe-1.5 text-foreground">{label}</span>}
    </label>
  )
}
