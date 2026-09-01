'use client'

import { useActionState, useState } from 'react'
import { MoreHorizontal, CalendarClock, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SeriesManageState } from '@/app/(dashboard)/lessons/new-series/actions'

const IDLE: SeriesManageState = { error: null }

/**
 * Per-row actions on the existing-series list: change the end date (a later
 * date extends the series with new lessons, an earlier one cancels the tail)
 * and delete the whole series. Server actions arrive as props per the
 * server-action prop rule.
 */
export function SeriesRowActions({
  seriesId,
  currentUntil,
  defaultStopDate,
  updateUntilAction,
  stopAction,
}: {
  seriesId: string
  currentUntil: string
  defaultStopDate: string
  updateUntilAction: (prev: SeriesManageState, formData: FormData) => Promise<SeriesManageState>
  stopAction: (prev: SeriesManageState, formData: FormData) => Promise<SeriesManageState>
}) {
  const t = useTranslations('lessons.series')
  const tCommon = useTranslations('common')
  const [dialog, setDialog] = useState<'until' | 'stop' | null>(null)
  const [untilState, submitUntil, untilPending] = useActionState(updateUntilAction, IDLE)
  const [stopState, submitStop, stopPending] = useActionState(stopAction, IDLE)

  const doneMessage = (state: SeriesManageState) => {
    if (state.error || state.affected === undefined) return null
    if (state.action === 'extended') return t('extendedCount', { count: state.affected })
    if (state.action === 'shortened') return t('shortenedCount', { count: state.affected })
    return null
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('rowActions')}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('until')}>
            <CalendarClock className="me-2 h-4 w-4" />
            {t('changeUntil')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('stop')} className="text-destructive">
            <Trash2 className="me-2 h-4 w-4" />
            {t('stopSeries')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Change end date — later = extend, earlier = shorten */}
      <Dialog open={dialog === 'until'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form action={submitUntil}>
            <DialogHeader>
              <DialogTitle>{t('changeUntil')}</DialogTitle>
              <DialogDescription>{t('changeUntilHint')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor={`until-${seriesId}`}>{t('newUntilLabel')}</Label>
              <Input
                id={`until-${seriesId}`}
                type="date"
                name="until"
                defaultValue={currentUntil}
                required
              />
              <input type="hidden" name="series_id" value={seriesId} />
              <input type="hidden" name="current_until" value={currentUntil} />
              {untilState.error && <p className="text-sm text-destructive">{untilState.error}</p>}
              {doneMessage(untilState) && (
                <p className="text-sm text-green-700">{doneMessage(untilState)}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {tCommon('actions.close')}
              </Button>
              <Button type="submit" disabled={untilPending}>
                {untilPending ? tCommon('actions.saving') : tCommon('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stop series from a required date. */}
      <Dialog open={dialog === 'stop'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <form action={submitStop}>
            <DialogHeader>
              <DialogTitle>{t('stopSeries')}</DialogTitle>
              <DialogDescription>{t('stopSeriesHint')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor={`stop-${seriesId}`}>{t('stopFromDate')}</Label>
              <Input id={`stop-${seriesId}`} type="date" name="stop_from_date" defaultValue={defaultStopDate} required />
              <input type="hidden" name="series_id" value={seriesId} />
              {stopState.error && <p className="text-sm text-destructive">{stopState.error}</p>}
              {stopState.action === 'stopped' && !stopState.error && (
                <p className="text-sm text-green-700">{t('stoppedCount', { count: stopState.affected ?? 0 })}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {t('keepSeries')}
              </Button>
              <Button type="submit" variant="destructive" disabled={stopPending}>
                {stopPending ? tCommon('actions.saving') : t('confirmStop')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
