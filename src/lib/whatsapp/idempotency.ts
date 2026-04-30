import { createServiceRoleClient } from '@/lib/supabase/service-role'

function isDuplicateInsertError(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

/**
 * Claims an inbound WhatsApp message for processing.
 * Duplicate `message_id` values for the same org are treated as already handled.
 */
export async function claimIncomingMessage(
  organizationId: string,
  messageId: string,
  phone: string
): Promise<boolean> {
  const db = createServiceRoleClient()
  const { error } = await db.from('whatsapp_processed_messages').insert({
    organization_id: organizationId,
    message_id: messageId,
    phone,
  })

  if (!error) {
    return true
  }

  if (isDuplicateInsertError(error)) {
    return false
  }

  throw new Error(`Failed to claim incoming WhatsApp message: ${error.message}`)
}

/**
 * Releases a previously claimed message when processing fails before completion,
 * allowing Meta retries to re-enter the handler.
 */
export async function releaseIncomingMessageClaim(
  organizationId: string,
  messageId: string
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('whatsapp_processed_messages')
    .delete()
    .eq('organization_id', organizationId)
    .eq('message_id', messageId)

  if (error) {
    console.error('[whatsapp/idempotency] Failed to release message claim', {
      organizationId,
      messageId,
      error,
    })
  }
}
