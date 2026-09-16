'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Ticket } from 'lucide-react'
import { formatMoney } from '@/lib/i18n/formatCurrency'
import type { PackActionResult, StudentPacksData } from '@/app/(dashboard)/packs/actions'
import { PackForm } from './PackForm'

interface Props {
  studentId: string
  studentName: string
  fetchAction: (studentId: string) => Promise<{ data: StudentPacksData } | { error: string }>
  sellAction: Parameters<typeof PackForm>[0]['sellAction']
}

type Loaded = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: StudentPacksData }

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'numeric', year: '2-digit' }).format(
    new Date(`${iso}T12:00:00Z`)
  )
}

/** The section with its own titled card, for the student sheet. */
export function StudentPacksCard(props: Props) {
  const t = useTranslations('packs')
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <h3 className="px-4 pt-3 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {t('card.title')}
      </h3>
      <StudentPacksSection {...props} />
    </section>
  )
}

/**
 * The student's punch cards (decision #46). Owner/admin see the full picture and
 * can sell; a teacher or office manager sees what is left and until when.
 */
export function StudentPacksSection({ studentId, studentName, fetchAction, sellAction }: Props) {
  const t = useTranslations('packs')
  const locale = useLocale()
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [selling, setSelling] = useState(false)

  const load = useCallback(() => {
    fetchAction(studentId).then((result) =>
      setLoaded('error' in result ? { status: 'error', error: result.error } : { status: 'ready', data: result.data })
    )
  }, [fetchAction, studentId])

  useEffect(() => {
    load()
  }, [load])

  if (loaded.status === 'loading') return <div className="h-14 animate-pulse rounded-xl bg-muted" />
  if (loaded.status === 'error') return <p className="px-4 py-3 text-sm text-destructive">{loaded.error}</p>

  const { data } = loaded
  const visible =
    data.mode === 'full' ? data.packs.filter((p) => p.status !== 'cancelled') : data.packs

  return (
    <div>
      {visible.length === 0 && !selling ? (
        <div className="px-4 py-6 flex flex-col items-center text-center gap-1.5">
          <Ticket size={28} className="text-muted-foreground/30" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('card.none')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {visible.map((pack) => {
            const until = formatDate(pack.valid_until, locale)
            const isFamily = 'isFamily' in pack ? pack.isFamily : pack.student_id === null
            return (
              <li key={pack.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {pack.name}
                    {isFamily && <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t('card.family')}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('balance', { remaining: pack.remaining, total: pack.total_credits })}
                    {' · '}
                    {until ? t('validUntil', { date: until }) : t('noExpiry')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs font-medium">{t(`status.${pack.status}`)}</span>
                  {data.mode === 'full' && 'price' in pack && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatMoney(pack.price, locale)}
                      {pack.charge?.refunded_at ? ` · ${t('refundedBadge')}` : ''}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {data.mode === 'full' && selling && (
        <PackForm
          studentId={studentId}
          studentName={studentName}
          products={data.products}
          packScope={data.packScope}
          packActivation={data.packActivation}
          billingMode={data.billingMode}
          isOwner={data.isOwner}
          sellAction={async (input) => {
            const result: PackActionResult = await sellAction(input)
            return result
          }}
          onDone={() => {
            setSelling(false)
            load()
          }}
          onCancel={() => setSelling(false)}
        />
      )}

      {data.mode === 'full' && !selling && (
        <div className="flex items-center justify-between px-4 pb-3 pt-2">
          <button type="button" onClick={() => setSelling(true)} className="text-xs text-primary hover:underline">
            + {t('card.sell')}
          </button>
          <Link href="/packs" className="text-xs text-muted-foreground hover:text-foreground">{t('card.showAll')}</Link>
        </div>
      )}
    </div>
  )
}
