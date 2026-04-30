import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { ApproveBillingButton } from '@/app/(dashboard)/billing/ApproveBillingButton'
import { MarkPaidButton } from '@/app/(dashboard)/billing/MarkPaidButton'

type BillingRecord = {
  id: string
  student_id: string
  is_paid: boolean
  is_approved: boolean
  lessons_amount: number
  subscriptions_amount: number
  cancellations_amount: number
  total_amount: number
  lessons_count: number
  manual_adjustment_amount: number | null
  students: { id: string; full_name: string } | null
}

function getBillingStatus(row: { is_paid: boolean; is_approved: boolean }): string {
  if (row.is_paid) return 'paid'
  if (!row.is_approved) return 'pending_approval'
  return 'approved'
}

interface Props {
  records: BillingRecord[]
  billingMonth: string
  isOwnerOrAdmin: boolean
  labels: {
    lessons: string
    subscriptions: string
    cancellations: string
    adjustment: string
    total: string
    paid: string
    edit: string
  }
}

export function BillingRecordsMobileList({
  records,
  billingMonth,
  isOwnerOrAdmin,
  labels,
}: Props) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {records.map((record) => {
        const status = getBillingStatus(record)
        const studentName = record.students?.full_name ?? '—'
        return (
          <div
            key={record.id}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <UserAvatar name={studentName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{studentName}</p>
                  <Link
                    href={`/billing/${record.student_id}?month=${billingMonth}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {labels.edit} ↗
                  </Link>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>
            {/* Amount in first column (inline-start) so ₪ stays at the “Hebrew” edge; label in second column */}
            <div className="mt-3 grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
              <span
                dir="ltr"
                className="text-lg font-semibold tabular-nums text-foreground"
              >
                ₪{Number(record.total_amount).toFixed(2)}
              </span>
              <span className="text-end text-sm text-muted-foreground">{labels.total}</span>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                <dt className="col-start-2 row-start-1 text-end text-muted-foreground">
                  {labels.lessons}
                </dt>
                <dd className="col-start-1 row-start-1 font-mono text-foreground" dir="ltr">
                  ₪{Number(record.lessons_amount).toFixed(2)} ({record.lessons_count})
                </dd>
              </div>
              <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                <dt className="col-start-2 row-start-1 text-end text-muted-foreground">
                  {labels.subscriptions}
                </dt>
                <dd className="col-start-1 row-start-1 font-mono text-foreground" dir="ltr">
                  ₪{Number(record.subscriptions_amount).toFixed(2)}
                </dd>
              </div>
              <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                <dt className="col-start-2 row-start-1 text-end text-muted-foreground">
                  {labels.cancellations}
                </dt>
                <dd className="col-start-1 row-start-1 font-mono text-foreground" dir="ltr">
                  ₪{Number(record.cancellations_amount).toFixed(2)}
                </dd>
              </div>
              <div className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-2">
                <dt className="col-start-2 row-start-1 text-end text-muted-foreground">
                  {labels.adjustment}
                </dt>
                <dd className="col-start-1 row-start-1 font-mono text-foreground" dir="ltr">
                  {record.manual_adjustment_amount != null ? (
                    <span
                      className={
                        Number(record.manual_adjustment_amount) < 0
                          ? 'text-red-600'
                          : 'text-foreground'
                      }
                    >
                      ₪{Number(record.manual_adjustment_amount).toFixed(2)}
                    </span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            {isOwnerOrAdmin && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {record.is_paid ? (
                  <span className="text-xs text-muted-foreground">{labels.paid}</span>
                ) : !record.is_approved ? (
                  <ApproveBillingButton billingId={record.id} />
                ) : (
                  <MarkPaidButton billingId={record.id} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
