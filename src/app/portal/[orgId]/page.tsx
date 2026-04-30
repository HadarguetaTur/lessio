import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal/session'

/**
 * Portal root — redirect to home if session valid, otherwise to login.
 * Per /docs/sprint-13-scope.md § Story 6.
 */
export default async function PortalRootPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const session = await getPortalSession()

  if (session?.orgId === orgId) {
    redirect(`/portal/${orgId}/home`)
  }
  redirect(`/portal/${orgId}/login`)
}
