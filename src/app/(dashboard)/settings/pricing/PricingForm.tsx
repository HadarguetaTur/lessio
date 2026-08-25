'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { savePricingAction } from './actions'

interface InitialData {
  individualHourlyRate: number | null
  pairPricePerStudent: number
  groupPricePerStudent: number
}

export default function PricingForm({
  initialData,
  teachersWithOwnRate,
}: {
  initialData: InitialData
  teachersWithOwnRate: number
}) {
  const t = useTranslations('settings.pricing')
  const tCommon = useTranslations('common')

  const [isPending, startTransition] = useTransition()

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const result = await savePricingAction(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('saved'))
      }
    })
  }

  return (
    <form action={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('individualTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="default_individual_hourly_rate">{t('individualRate')}</Label>
          <Input
            id="default_individual_hourly_rate"
            name="default_individual_hourly_rate"
            type="number"
            step="0.01"
            min="0"
            dir="ltr"
            defaultValue={initialData.individualHourlyRate ?? ''}
            placeholder={t('individualRatePlaceholder')}
          />
          <p className="text-xs text-muted-foreground">{t('individualHint')}</p>
          {teachersWithOwnRate > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('teacherOverrideCount', { count: teachersWithOwnRate })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('perStudentTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pair_price_per_student">{t('pairPrice')}</Label>
            <Input
              id="pair_price_per_student"
              name="pair_price_per_student"
              type="number"
              step="0.01"
              min="0"
              dir="ltr"
              required
              defaultValue={initialData.pairPricePerStudent}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group_price_per_student">{t('groupPrice')}</Label>
            <Input
              id="group_price_per_student"
              name="group_price_per_student"
              type="number"
              step="0.01"
              min="0"
              dir="ltr"
              required
              defaultValue={initialData.groupPricePerStudent}
            />
          </div>

          <p className="text-xs text-muted-foreground">{t('perStudentHint')}</p>
          <p className="text-xs text-muted-foreground">{t('customHint')}</p>
        </CardContent>
      </Card>

      <Button type="submit" disabled={isPending}>
        {isPending ? tCommon('actions.saving') : tCommon('actions.save')}
      </Button>
    </form>
  )
}
