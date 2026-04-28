/**
 * notification-cleanup — Supabase Edge Function
 * Sprint 25 Story 4d.
 *
 * Trigger: scheduled cron, daily at 04:00 UTC
 *
 * Deletes in_app_notifications older than 30 days.
 * No archive — per sprint-25-scope.md decision.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceRoleKey)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { count, error } = await db
    .from('in_app_notifications')
    .delete()
    .lt('created_at', thirtyDaysAgo)
    .select('id', { count: 'exact', head: true })

  if (error) {
    console.error('[notification-cleanup] Failed to delete old notifications', { error: error.message })
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  console.info('[notification-cleanup] Deleted old notifications', { count })
  return new Response(JSON.stringify({ deleted: count ?? 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
