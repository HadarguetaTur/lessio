'use client'

import { useState, useTransition } from 'react'
import type { DeletionRequest } from '@/lib/superadmin/dataDeletion'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Props {
  requests: DeletionRequest[]
  orgId: string
  processAction: (requestId: string, action: 'anonymise' | 'dismiss', orgId: string) => Promise<{ error: string | null }>
}

export function DeletionRequestsSection({ requests, orgId, processAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Which request's confirmation is open. One at a time; null = closed.
  const [confirming, setConfirming] = useState<string | null>(null)

  const open = requests.filter((r) => r.status === 'open')
  const processed = requests.filter((r) => r.status !== 'open')

  function handle(requestId: string, action: 'anonymise' | 'dismiss') {
    setError(null)
    startTransition(async () => {
      const result = await processAction(requestId, action, orgId)
      // Inline, not alert(): a native dialog blocks the thread, cannot be
      // styled, and vanishes from the page the moment it is dismissed.
      if (result.error) setError(result.error)
      setConfirming(null)
    })
  }

  return (
    <div className="mt-6 border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-muted/50 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Deletion Requests (GDPR)
          {open.length > 0 && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {open.length} open
            </span>
          )}
        </h3>
      </div>

      {error && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive border-b border-border">
          {error}
        </p>
      )}

      {requests.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No deletion requests.</p>
      ) : (
        <div className="divide-y divide-border">
          {[...open, ...processed].map((req) => (
            <div key={req.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-mono text-foreground">{req.requesterPhone}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(req.createdAt).toLocaleDateString('en-GB')}
                  {' · '}
                  <span className={req.status === 'open' ? 'text-red-600 font-medium' : 'text-green-700'}>
                    {req.status}
                  </span>
                </p>
              </div>

              {req.status === 'open' && (
                <div className="flex gap-2 shrink-0">
                  {/* The one irreversible action in the product that used to
                      run on a bare click — no dialog, no confirm() (UX audit
                      F11). The copy says exactly what processDeletionRequest
                      changes, so the operator knows what survives. */}
                  <AlertDialog
                    open={confirming === req.id}
                    onOpenChange={(next) => {
                      if (isPending) return
                      setConfirming(next ? req.id : null)
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" size="sm" disabled={isPending}>
                        Anonymise
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Anonymise {req.requesterPhone}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The parent&apos;s name and phone number, and the names of their linked
                          students, are replaced with placeholders. Lessons, charges and history
                          stay, but can no longer be traced to them. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => handle(req.id, 'anonymise')}
                        >
                          {isPending ? 'Anonymising…' : 'Anonymise permanently'}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handle(req.id, 'dismiss')}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
