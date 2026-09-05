import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** Every .ts/.tsx file under a directory, recursively. */
function walk(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return walk(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

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

  /**
   * A `'use server'` directive registers every exported async function in the module
   * as a Server Action — a POST endpoint anyone can reach, including through the
   * public routes proxy.ts waves past the session check. The helpers under src/lib
   * take orgId as an argument and run on the service-role client, so a directive
   * there publishes an unauthenticated cross-tenant write. Actions belong in
   * src/app, where they resolve the org from the session first.
   */
  it('keeps Server Action directives out of src/lib', () => {
    const offenders = walk('src/lib').filter((path) =>
      /^\s*(['"])use server\1/m.test(read(path))
    )
    expect(offenders).toEqual(['src/lib/auth/actions.ts'])
  })

  describe('RLS hardening migration (20260904150000)', () => {
    const sql = () => read('supabase/migrations/20260904150000_rls_hardening.sql')

    /** The file's statements, with `--` commentary stripped out. */
    const statements = () =>
      sql()
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')

    it('revokes SELECT on organizations at table level, not per column', () => {
      // anon/authenticated hold a table-level SELECT, which already covers every
      // column — so `REVOKE SELECT (col, ...)` removes a grant that was never
      // issued and leaves the seven credential columns readable. Checked against
      // the statements rather than the file, since the comment above that
      // revoke necessarily quotes the broken form.
      expect(statements()).toMatch(/REVOKE SELECT ON organizations FROM authenticated, anon;/)
      expect(statements()).not.toMatch(/REVOKE SELECT\s*\(/)
    })

    it('scopes the WhatsApp teacher read through a SECURITY DEFINER helper', () => {
      // Inlined as a subquery the predicate is re-filtered by RLS on parents,
      // relationships and students, and silently matches nothing.
      expect(sql()).toMatch(/CREATE OR REPLACE FUNCTION public\.phones_reachable_by_teacher/)
      expect(sql()).toMatch(/SECURITY DEFINER/)
      expect(sql()).toMatch(/SET search_path = public, pg_temp/)
      expect(sql()).toMatch(/phone IN \(SELECT public\.phones_reachable_by_teacher\(\)\)/)
    })

    it('drops the restrictive deny that voided the notification bell', () => {
      expect(sql()).toMatch(/DROP POLICY IF EXISTS deny_all_in_app_notifications ON in_app_notifications;/)
    })

    it('leaves portal_messages fail-closed', () => {
      // Same dead-deny shape, but lifting it would grant teachers an org-wide
      // read of every family's private thread.
      expect(sql()).not.toMatch(/DROP POLICY[^\n]*deny_all_portal_messages/)
    })

    it('keeps homework writes available to teachers, scoped to their own', () => {
      expect(sql()).toMatch(/homework_assignments_teacher_own/)
      expect(sql()).toMatch(/teacher_id = public\.get_my_teacher_id\(\)/)
    })
  })

  it('does not embed a service-role JWT in the local smoke script', () => {
    const script = read('scripts/smoke-wa-conversations.ts')
    expect(script).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./)
    expect(script).toContain('SMOKE_SUPABASE_SERVICE_ROLE_KEY')
  })
})
