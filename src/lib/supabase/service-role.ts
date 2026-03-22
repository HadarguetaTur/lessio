import { createClient } from '@supabase/supabase-js'

// WARNING: Bypasses RLS entirely.
// Import only in server-side booking logic (src/lib/booking/*).
// Never reference in client components, hooks, or anything that reaches the browser.
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
