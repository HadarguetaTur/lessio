/** Read-only WhatsApp conversation smoke test against a local Supabase stack. */

const LOCAL_URL = process.env.SMOKE_SUPABASE_URL ?? 'http://127.0.0.1:55421'
const LOCAL_SERVICE_ROLE_KEY = process.env.SMOKE_SUPABASE_SERVICE_ROLE_KEY

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(LOCAL_URL)) {
  throw new Error(`[smoke] refusing to run against a non-local URL: ${LOCAL_URL}`)
}
if (!LOCAL_SERVICE_ROLE_KEY) {
  throw new Error('[smoke] SMOKE_SUPABASE_SERVICE_ROLE_KEY is required')
}

process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_ROLE_KEY

async function main() {
  const { getConversationSummaries, getThread } = await import('../src/lib/whatsapp/conversations')
  const orgId = process.env.SMOKE_ORG_ID ?? 'a1000000-0000-0000-0000-000000000001'
  const summaries = await getConversationSummaries(orgId)
  console.log(`[smoke] ${summaries.length} conversation(s)`)
  if (summaries[0]) {
    const thread = await getThread(orgId, summaries[0].phone)
    console.log(`[smoke] first thread contains ${thread.length} message(s)`)
  }
}

main().catch((error) => {
  console.error('[smoke] failed', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
