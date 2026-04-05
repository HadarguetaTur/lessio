/**
 * DB helpers for the conversation_log table.
 * All writes use service role. Reads are scoped by org_id + phone.
 * Per /docs/sprint-19-scope.md § Story 1.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type ConversationRole = 'user' | 'assistant'

export interface ConversationTurn {
  role: ConversationRole
  content: string
}

const WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours

function since24h(): string {
  return new Date(Date.now() - WINDOW_MS).toISOString()
}

/** Returns the last `limit` turns for (org, phone) within the past 24 hours, chronological order. */
export async function getRecentHistory(
  orgId: string,
  phone: string,
  limit = 10
): Promise<ConversationTurn[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('conversation_log')
    .select('role, content')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .gte('created_at', since24h())
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[conversation-log] getRecentHistory error', { orgId, phone, error })
    return []
  }

  return ((data ?? []) as ConversationTurn[]).reverse()
}

/** Counts assistant replies for (org, phone) in the past 24 hours. */
export async function countAssistantReplies(orgId: string, phone: string): Promise<number> {
  const db = createServiceRoleClient()

  const { count, error } = await db
    .from('conversation_log')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .eq('role', 'assistant')
    .gte('created_at', since24h())

  if (error) {
    console.error('[conversation-log] countAssistantReplies error', { orgId, phone, error })
    throw new Error('Failed to count assistant replies')
  }

  return count ?? 0
}

/** Inserts a user + assistant turn pair for the given exchange. */
export async function logExchange(
  orgId: string,
  phone: string,
  parentId: string | null,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  const db = createServiceRoleClient()

  const rows = [
    { organization_id: orgId, phone, parent_id: parentId, role: 'user' as const, content: userMessage },
    { organization_id: orgId, phone, parent_id: parentId, role: 'assistant' as const, content: assistantReply },
  ]

  const { error } = await db.from('conversation_log').insert(rows)

  if (error) {
    console.error('[conversation-log] logExchange error', { orgId, phone, error })
  }
}
