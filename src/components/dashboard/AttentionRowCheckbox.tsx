'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { AttentionActionResult } from '@/app/(dashboard)/dashboard/actions'

interface AttentionRowCheckboxProps {
  id: string
  action: (id: string) => Promise<AttentionActionResult>
  /** Accessible name, already translated by the server parent. */
  label: string
}

/**
 * "Done" tick on an attention-card row. The action's revalidatePath removes
 * the row on success, so the checked+disabled state only bridges the gap;
 * on error the box reverts and the message surfaces as a toast.
 */
export function AttentionRowCheckbox({ id, action, label }: AttentionRowCheckboxProps) {
  const [checked, setChecked] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleChange = () => {
    setChecked(true)
    startTransition(async () => {
      const result = await action(id)
      if (result.error) {
        setChecked(false)
        toast.error(result.error)
      } else if (result.chargeAlert) {
        toast.warning(result.chargeAlert)
      }
    })
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={handleChange}
      disabled={isPending || checked}
      aria-label={label}
      title={label}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
    />
  )
}
