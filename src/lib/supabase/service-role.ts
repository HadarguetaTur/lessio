import { createClient } from '@supabase/supabase-js'

// WARNING: Bypasses RLS entirely.
// Approved for server-only modules: src/lib/booking/*, src/lib/billing/*, src/lib/billing/*,
// src/lib/cancellation-flow/*, src/lib/leads/*, src/lib/payment-request/*, src/lib/charges/*,
// src/lib/lessons/*, and 'use server' server actions under src/app/**/actions.ts,
// and route handlers under src/app/api/**.
// Never reference in client components, client hooks, or anything that reaches the browser.
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
