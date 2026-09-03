/**
 * Smoke test for the WhatsApp conversations data layer against the LOCAL stack.
 *
 * The unit tests mock Supabase, so they cannot catch a malformed embed or a
 * filter PostgREST rejects. This runs the real queries.
 *
 *   npx tsx scripts/smoke-wa-conversations.ts
 *
 * Deliberately does NOT read .env.local — that file points at the production
 * project, and this script writes (the takeover round trip). It targets the
 * local stack only, and refuses to run against anything else.
 */

const LOCAL_URL = process.env.SMOKE_SUPABASE_URL ?? 'http://127.0.0.1:55421'

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(LOCAL_URL)) {
  console.error(`[smoke] refusing to run against a non-local URL: ${LOCAL_URL}`)
  process.exit(1)
}

process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_URL
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SMOKE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

import {
  canTeacherAccessPhone,
  getConversationHeader,
  getConversationSummaries,
  getThread,
} from '../src/lib/whatsapp/conversations'
import { getTakeover, releaseTakeover, setTakeover } from '../src/lib/whatsapp/takeover'

const ORG_ID = process.env.SMOKE_ORG_ID ?? 'a1000000-0000-0000-0000-000000000001'

async function main() {
  console.log('— summaries (owner view) —')
  const summaries = await getConversationSummaries(ORG_ID)
  for (const s of summaries) {
    console.log(
      `  ${s.phone}  ${s.displayName ?? '(unnamed)'}  role=${s.senderRole}  awaiting=${s.awaitingReply}  takenOver=${s.takenOver}  "${s.lastMessage.slice(0, 40)}"`
    )
  }

  const first = summaries[0]
  if (!first) {
    console.log('  (no conversations — seed some rows first)')
    return
  }

  console.log('\n— thread —')
  for (const m of await getThread(ORG_ID, first.phone)) {
    console.log(
      `  ${m.isInbound ? '←' : '→'} [${m.origin ?? 'in'}] ${m.senderName ?? ''} ${m.body.slice(0, 50)}`
    )
  }

  console.log('\n— header —')
  console.log(' ', await getConversationHeader(ORG_ID, first.phone))

  console.log('\n— takeover round trip —')
  const profileId = process.env.SMOKE_PROFILE_ID
  if (profileId) {
    await setTakeover(ORG_ID, first.phone, profileId)
    console.log('  after set:', await getTakeover(ORG_ID, first.phone))
    await releaseTakeover(ORG_ID, first.phone)
    console.log('  after release:', await getTakeover(ORG_ID, first.phone))
  } else {
    console.log('  (set SMOKE_PROFILE_ID to exercise this)')
  }

  const teacherId = process.env.SMOKE_TEACHER_ID
  if (teacherId) {
    console.log('\n— teacher scoping —')
    console.log('  summaries:', (await getConversationSummaries(ORG_ID, { teacherId })).length)
    console.log('  canAccess first phone:', await canTeacherAccessPhone(ORG_ID, teacherId, first.phone))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
