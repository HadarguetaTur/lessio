'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { saveBusinessProfileAction, uploadLogoAction } from './actions'

interface InitialData {
  businessLegalName: string | null
  taxId: string | null
  businessAddress: string | null
  currency: string
  defaultVatRate: number
  logoUrl: string | null
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
