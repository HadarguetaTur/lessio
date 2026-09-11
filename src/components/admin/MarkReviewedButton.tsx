'use client'

import { useActionState } from 'react'
import { CheckCheck, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { OutboundActionState } from '@/app/(admin)/admin/outbound/actions'

type OutboundAction = (prev: OutboundActionState | null, formData: FormData) => Promise<OutboundActionState>

/** "I read this": clears one reply from the needs-a-look list. */
export function MarkReviewedButton({
  messageId,
  label,
  action,
}: {
  messageId: string
  label: string
  action: OutboundAction
}) {
  const [, run, pending] = useActionState(action, null)
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation()
        const fd = new FormData()
        fd.set('messageId', messageId)
        run(fd)
      }}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
      {label}
    </Button>
  )
}
