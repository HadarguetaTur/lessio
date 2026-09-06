import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const OFFICIAL_TEST = Object.freeze({
  terminal: '1000',
  apiName: 'rZGQYWFfHcSlFozzUeZ6',
  apiPassword: 'efzo75Mk9kbe1iKFRaUW',
})

const FIXTURE = Object.freeze({
  orgId: 'ca2dc0e2-0000-4000-8000-000000000001',
  parentId: 'ca2dc0e2-0000-4000-8000-000000000002',
  chargeId: 'ca2dc0e2-0000-4000-8000-000000000003',
  orgName: 'Lessio Cardcom Preview E2E',
  orgSlug: 'lessio-cardcom-preview-e2e',
  amount: 1,
})

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function db() {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

function encrypt(plaintext) {
  const keyHex = required('PAYMENT_CONFIG_ENCRYPTION_KEY')
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error('Invalid payment encryption key')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, encrypted, cipher.getAuthTag()].map((part) => part.toString('base64')).join(':')
}

function assertPreviewUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) {
    throw new Error('Refusing to run: callback must be an HTTPS vercel.app Preview URL')
  }
  if (url.hostname === 'lessio.vercel.app' || url.hostname.includes('www.getlessio.com')) {
    throw new Error('Refusing to run against a production hostname')
  }
  return url.origin
}

async function removeFixture(client) {
  const { data: existing, error: findError } = await client
    .from('organizations')
    .select('id,name,slug')
    .eq('id', FIXTURE.orgId)
    .maybeSingle()
  if (findError) throw findError
  if (!existing) return false
  if (existing.name !== FIXTURE.orgName || existing.slug !== FIXTURE.orgSlug) {
    throw new Error('Refusing to delete an organization that is not the dedicated E2E fixture')
  }
  const { error } = await client.from('organizations').delete().eq('id', FIXTURE.orgId)
  if (error) throw error
  return true
}

async function setup(previewUrl, bypassSecret) {
  const origin = assertPreviewUrl(previewUrl)
  if (!bypassSecret || bypassSecret.length < 20) throw new Error('A Vercel automation bypass secret is required')

  const client = db()
  await removeFixture(client)

  const encryptedConfig = encrypt(JSON.stringify({
    terminal: OFFICIAL_TEST.terminal,
    apiName: OFFICIAL_TEST.apiName,
    apiPassword: OFFICIAL_TEST.apiPassword,
  }))

  const { error: orgError } = await client.from('organizations').insert({
    id: FIXTURE.orgId,
    name: FIXTURE.orgName,
    slug: FIXTURE.orgSlug,
    payment_provider: 'cardcom',
    payment_config_encrypted: encryptedConfig,
    receipt_mode: 'none',
  })
  if (orgError) throw orgError

  const { error: parentError } = await client.from('parents').insert({
    id: FIXTURE.parentId,
    organization_id: FIXTURE.orgId,
    full_name: 'Cardcom E2E Test Parent',
    phone: '+972500000001',
  })
  if (parentError) throw parentError

  const { error: chargeError } = await client.from('charges').insert({
    id: FIXTURE.chargeId,
    organization_id: FIXTURE.orgId,
    parent_id: FIXTURE.parentId,
    amount: FIXTURE.amount,
    charge_type: 'manual',
    status: 'pending',
    notes: 'Cardcom official test-terminal E2E',
  })
  if (chargeError) throw chargeError

  const callback = new URL('/api/payments/cardcom', origin)
  callback.searchParams.set('x-vercel-protection-bypass', bypassSecret)
  const response = await fetch('https://secure.cardcom.solutions/api/v11/LowProfile/Create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      TerminalNumber: Number(OFFICIAL_TEST.terminal),
      ApiName: OFFICIAL_TEST.apiName,
      Operation: 'ChargeOnly',
      Amount: FIXTURE.amount,
      ISOCoinId: 1,
      ReturnValue: FIXTURE.chargeId,
      ProductName: 'LESSIO CARDCOM TEST ONLY',
      WebHookUrl: callback.toString(),
      SuccessRedirectUrl: `${origin}/portal/${FIXTURE.orgId}/payments?payment=success`,
      FailedRedirectUrl: `${origin}/portal/${FIXTURE.orgId}/payments?payment=cancelled`,
      AdvancedDefinition: {
        ApiPassword: OFFICIAL_TEST.apiPassword,
        MaxNumOfPayments: 1,
      },
    }),
  })
  const result = await response.json()
  if (!response.ok || result.ResponseCode !== 0 || !result.LowProfileId || !result.Url) {
    throw new Error(`Cardcom test-page creation failed: ${response.status} ${JSON.stringify(result)}`)
  }

  const { error: updateError } = await client.from('charges').update({
    payment_link: result.Url,
    payment_reference: result.LowProfileId,
    payment_provider: 'cardcom',
  }).eq('id', FIXTURE.chargeId)
  if (updateError) throw updateError

  console.log(JSON.stringify({
    fixture: FIXTURE,
    lowProfileId: result.LowProfileId,
    paymentUrl: result.Url,
    callbackHost: origin,
    callbackBypassAttached: true,
    receiptMode: 'none',
    cardcomTerminal: OFFICIAL_TEST.terminal,
    runId: randomUUID(),
  }, null, 2))
}

async function status() {
  const client = db()
  const [{ data: org, error: orgError }, { data: charge, error: chargeError }, payments, audits] = await Promise.all([
    client.from('organizations').select('id,name,slug,payment_provider,receipt_mode,receipt_provider').eq('id', FIXTURE.orgId).maybeSingle(),
    client.from('charges').select('id,status,amount,amount_paid,payment_provider,payment_reference,paid_at,receipt_url,receipt_issued_at').eq('id', FIXTURE.chargeId).maybeSingle(),
    client.from('charge_payments').select('id,amount,method,provider_reference,paid_at').eq('charge_id', FIXTURE.chargeId),
    client.from('charge_audit_log').select('id,event_type').eq('charge_id', FIXTURE.chargeId),
  ])
  if (orgError) throw orgError
  if (chargeError) throw chargeError
  if (payments.error) throw payments.error
  if (audits.error) throw audits.error
  console.log(JSON.stringify({ org, charge, payments: payments.data, audits: audits.data }, null, 2))
}

async function cleanup() {
  const removed = await removeFixture(db())
  console.log(JSON.stringify({ removed, fixtureOrgId: FIXTURE.orgId }))
}

const [command, ...args] = process.argv.slice(2)
if (command === 'setup') await setup(args[0], args[1])
else if (command === 'status') await status()
else if (command === 'cleanup') await cleanup()
else throw new Error('Usage: node scripts/cardcom-preview-e2e.mjs <setup PREVIEW_URL BYPASS|status|cleanup>')
