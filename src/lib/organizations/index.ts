import { createClient } from '@/lib/supabase/server'

export async function getOrgTimezone(organizationId: string): Promise<string> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', organizationId)
    .single()

  return data?.timezone ?? 'Asia/Jerusalem'
}
