'use client'

import { Repeat } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CancelSeriesActionResult } from '@/app/(dashboard)/lessons/[id]/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type FormAction = (
  prevState: CancelSeriesActionResult,
  formData: FormData
) => Promise<CancelSeriesActionResult>

interface Props {
  cancelSeriesAction: FormAction
  defaultStopDate: string
}

const initialState: CancelSeriesActionResult = { error: null }

export function SeriesBanner({ cancelSeriesAction, defaultStopDate }: Props) {
  const t = useTranslations('lessons')
  const [state, formAction, pending] = useActionState(cancelSeriesAction, initialState)
  const [open, setOpen] = useState(false)

  if (state.removed !== undefined && state.error === null) {
    return (
      <div className="flex flex-col gap-1 p-3 rounded-lg bg-green-50 border border-green-100 text-sm text-green-700 mb-4">
        <span className="flex items-center gap-2">
          <Repeat size={15} />
          {t('series.stoppedCount', { count: state.removed })}
        </span>
        {!!state.kept && (
          <span className="text-muted-foreground">{t('series.keptCount', { count: state.kept })}</span>
        )}
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg bg-purple-50 border border-purple-100 text-sm text-purple-700 mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <Repeat size={15} />
        <span>{t('series.partOfSeries')}</span>
      </div>

      {state.error && (
        <p className="text-red-600 text-xs">{state.error}</p>
      )}

      <button type="button" onClick={() => setOpen(true)}
        className="px-3 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50">
        {t('series.stopSeries')}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={formAction}>
            <DialogHeader>
              <DialogTitle>{t('series.stopSeries')}</DialogTitle>
              <DialogDescription>{t('series.stopSeriesHint')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="stop-from-date">{t('series.stopFromDate')}</Label>
              <Input id="stop-from-date" name="stop_from_date" type="date" defaultValue={defaultStopDate} required />
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('series.keepSeries')}</Button>
              <Button type="submit" variant="destructive" disabled={pending}>{pending ? '...' : t('series.confirmStop')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
