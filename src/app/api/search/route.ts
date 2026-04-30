import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { globalSearch } from '@/lib/search/globalSearch'
import { globalSearchQuerySchema } from '@/lib/search/schema'

/**
 * GET /api/search?q=...
 * Org-scoped global search; RLS applied via Supabase server client in globalSearch.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    const q = request.nextUrl.searchParams.get('q') ?? ''

    const parsed = globalSearchQuerySchema.safeParse({ q })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_query', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const result = await globalSearch({
      organizationId: session.orgId,
      role: session.role,
      query: parsed.data.q,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'search_failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
