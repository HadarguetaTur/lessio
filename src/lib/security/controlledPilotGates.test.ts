import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('controlled-pilot security gates', () => {
  it('locks cancellation sessions and homework media in the forward migration', () => {
    const sql = read('supabase/migrations/20260903130000_controlled_pilot_security.sql')
    expect(sql).toMatch(/ALTER TABLE cancellation_sessions ENABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/deny_all_cancellation_sessions/i)
    expect(sql).toMatch(/UPDATE storage\.buckets[\s\S]*SET public = false/i)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "public read homework media"/i)
  })

  it('uses the application role helper for WhatsApp conversation policies', () => {
    const sql = read('supabase/migrations/20260903130000_controlled_pilot_security.sql')
    expect(sql).toContain('public.app_role()')
  })

  it('does not embed a service-role JWT in the local smoke script', () => {
    const script = read('scripts/smoke-wa-conversations.ts')
    expect(script).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./)
    expect(script).toContain('SMOKE_SUPABASE_SERVICE_ROLE_KEY')
  })
})
