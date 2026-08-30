import { NextResponse, type NextRequest } from 'next/server'

import { getSuperAdminSessionOrNull } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * Org lookup for the admin ⌘K palette.
 *
 * Per /docs/sprint-34-scope.md § מבנה המידע החדש.
 *
 * Superadmin-only and answers 401 rather than redirecting — a redirect would
 * reach the palette's `fetch` as a 200 page of HTML.
 */
export async function GET(request: NextRequest) {
  const session = await getSuperAdminSessionOrNull()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const raw = (request.nextUrl.searchParams.get('q') ?? '').trim()
  // A comma or a parenthesis would break out of PostgREST's `or` filter list,
  // and `*` is its wildcard. None belong in an org name being searched for.
  const term = raw.replace(/[(),*]/g, ' ').trim().slice(0, 60)

  if (term.length < 2) {
    return NextResponse.json({ organizations: [] })
  }

  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organizations')
    .select('id, name, slug')
    .or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
    .order('name', { ascending: true })
    .limit(8)

  if (error) {
    console.error('[admin/org-search] query failed', error.message)
    return NextResponse.json({ organizations: [] })
  }

  return NextResponse.json({ organizations: data ?? [] })
}
