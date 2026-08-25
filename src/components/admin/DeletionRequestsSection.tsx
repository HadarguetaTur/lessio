'use client'

import { useTransition } from 'react'
import type { DeletionRequest } from '@/lib/superadmin/dataDeletion'

interface Props {
  requests: DeletionRequest[]
  orgId: string
  processAction: (requestId: string, action: 'anonymise' | 'dismiss', orgId: string) => Promise<{ error: string | null }>
}

export function DeletionRequestsSection({ requests, orgId, processAction }: Props) {
  const [isPending, startTransition] = useTransition()

  const open = requests.filter((r) => r.status === 'open')
  const processed = requests.filter((r) => r.status !== 'open')

  function handle(requestId: string, action: 'anonymise' | 'dismiss') {
    startTransition(async () => {
      const result = await processAction(requestId, action, orgId)
      if (result.error) alert(result.error)
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
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handle(req.id, 'anonymise')}
                    className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    Anonymise
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handle(req.id, 'dismiss')}
                    className="px-3 py-1 text-xs font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
