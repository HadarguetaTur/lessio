'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { saveBusinessProfileAction, uploadLogoAction } from './actions'
import { normalizeLessonDurations, type LessonDurationSetting } from '@/lib/organizations/lessonDurations'

interface InitialData {
  businessLegalName: string | null
  taxId: string | null
  businessAddress: string | null
  currency: string
  defaultVatRate: number
  logoUrl: string | null
  enforceWeeklyQuota: boolean
  lessonDurations: unknown
}

const CURRENCY_OPTIONS = [
  { value: 'ILS', label: '₪ ILS' },
  { value: 'USD', label: '$ USD' },
  { value: 'EUR', label: '€ EUR' },
  { value: 'GBP', label: '£ GBP' },
] as const

export default function BusinessProfileForm({
  initialData,
}: {
  initialData: InitialData
}) {
  const t = useTranslations('settings.businessProfile')
  const tCommon = useTranslations('common')

  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialData.logoUrl)
  const [lessonDurations, setLessonDurations] = useState<LessonDurationSetting[]>(
    normalizeLessonDurations(initialData.lessonDurations)
  )
  const [newDuration, setNewDuration] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleSave(formData: FormData) {
    startTransition(async () => {
      const result = await saveBusinessProfileAction(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('saved'))
      }
    })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadLogoAction(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('logoUploaded'))
        if (result.logoUrl) setLogoUrl(result.logoUrl)
      }
    } finally {
      setIsUploading(false)
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function addDuration() {
    const minutes = Number(newDuration)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) return
    setLessonDurations((current) => [
      ...current.filter((item) => item.minutes !== minutes),
      { minutes, bot: true, teacher: true, admin: true },
    ].sort((a, b) => a.minutes - b.minutes))
    setNewDuration('')
  }

  function toggleDuration(minutes: number, audience: 'bot' | 'teacher' | 'admin') {
    setLessonDurations((current) => current.map((item) =>
      item.minutes === minutes ? { ...item, [audience]: !item[audience] } : item
    ))
  }

  return (
    <div className="space-y-6">
      {/* Logo Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('logoTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="size-20 rounded-lg border border-border object-contain bg-muted/40"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
                {t('noLogo')}
              </div>
            )}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? t('uploading') : t('uploadLogo')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('logoHint')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Details Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detailsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSave} className="space-y-4">
            {/* Business Legal Name */}
            <div className="space-y-1.5">
              <Label htmlFor="business_legal_name">{t('businessLegalName')}</Label>
              <Input
                id="business_legal_name"
                name="business_legal_name"
                defaultValue={initialData.businessLegalName ?? ''}
                placeholder={t('businessLegalNamePlaceholder')}
              />
            </div>

            {/* Tax ID */}
            <div className="space-y-1.5">
              <Label htmlFor="tax_id">{t('taxId')}</Label>
              <Input
                id="tax_id"
                name="tax_id"
                defaultValue={initialData.taxId ?? ''}
                placeholder={t('taxIdPlaceholder')}
              />
            </div>

            {/* Business Address */}
            <div className="space-y-1.5">
              <Label htmlFor="business_address">{t('businessAddress')}</Label>
              <Input
                id="business_address"
                name="business_address"
                defaultValue={initialData.businessAddress ?? ''}
                placeholder={t('businessAddressPlaceholder')}
              />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label htmlFor="currency">{t('currency')}</Label>
              <select
                id="currency"
                name="currency"
                defaultValue={initialData.currency}
                className="flex h-8 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Default VAT Rate */}
            <div className="space-y-1.5">
              <Label htmlFor="default_vat_rate">{t('defaultVatRate')}</Label>
              <div className="relative">
                <Input
                  id="default_vat_rate"
                  name="default_vat_rate"
                  type="number"
                  min={0}
                  max={25}
                  step={0.5}
                  defaultValue={initialData.defaultVatRate}
                  className="pe-8"
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t('vatHint')}</p>
            </div>

            {/* Weekly quota enforcement */}
            <div className="space-y-1.5 border-t border-border pt-4">
              <label className="flex cursor-pointer select-none items-center gap-3">
                <input
                  id="enforce_weekly_quota"
                  type="checkbox"
                  name="enforce_weekly_quota"
                  defaultChecked={initialData.enforceWeeklyQuota}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium">{t('enforceWeeklyQuota')}</span>
              </label>
              <p className="text-xs text-muted-foreground">{t('enforceWeeklyQuotaHint')}</p>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium">{t('lessonDurationsTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('lessonDurationsHint')}</p>
              </div>
              <input type="hidden" name="lesson_duration_settings" value={JSON.stringify(lessonDurations)} />
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('durationMinutes')}</th>
                      <th className="px-3 py-2 text-center">{t('availableBot')}</th>
                      <th className="px-3 py-2 text-center">{t('availableTeacher')}</th>
                      <th className="px-3 py-2 text-center">{t('availableAdmin')}</th>
                      <th className="px-3 py-2"><span className="sr-only">{t('removeDuration')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessonDurations.map((item) => (
                      <tr key={item.minutes} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{item.minutes}</td>
                        {(['bot', 'teacher', 'admin'] as const).map((audience) => (
                          <td key={audience} className="px-3 py-2 text-center">
                            <input type="checkbox" checked={item[audience]}
                              onChange={() => toggleDuration(item.minutes, audience)}
                              aria-label={`${item.minutes} ${t(`available${audience[0].toUpperCase()}${audience.slice(1)}`)}`}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-end">
                          <button type="button" onClick={() => setLessonDurations((current) => current.filter((d) => d.minutes !== item.minutes))}
                            disabled={lessonDurations.length === 1}
                            className="text-xs text-red-600 disabled:opacity-30">{t('removeDuration')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Input type="number" min={5} max={480} step={5} value={newDuration}
                  onChange={(event) => setNewDuration(event.target.value)} placeholder={t('newDurationPlaceholder')} />
                <Button type="button" variant="outline" onClick={addDuration}>{t('addDuration')}</Button>
              </div>
            </div>

            {/* Submit */}
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('actions.saving') : tCommon('actions.save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
