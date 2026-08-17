'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { forbidden } from 'next/navigation'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { encryptWithKey } from '@/lib/crypto'
import { ICountProvider } from '@/lib/receipts/icount'
import { SumitProvider } from '@/lib/receipts/sumit'
import type { ReceiptProviderType } from '@/lib/receipts/factory'
import { commonError } from '@/lib/i18n/actionErrors'

function getEncryptionKey(): string {
  const key = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('[receipts/settings] PAYMENT_CONFIG_ENCRYPTION_KEY missing or invalid')
  }
  return key
}

// ── Per-provider credential schemas ──────────────────────────────────────────

const GreenInvoiceSchema = z.object({
  provider: z.literal('green-invoice'),
  id:       z.string().min(1, 'API ID נדרש'),
  secret:   z.string().min(1, 'Secret נדרש'),
})

const ICountSchema = z.object({
  provider: z.literal('icount'),
  cid:      z.string().min(1, 'מזהה חברה (CID) נדרש'),
  user:     z.string().min(1, 'שם משתמש נדרש'),
  pass:     z.string().min(1, 'סיסמה נדרשת'),
})

const SumitSchema = z.object({
  provider:  z.literal('sumit'),
  companyId: z.string().min(1, 'Company ID נדרש'),
  apiKey:    z.string().min(1, 'API Key נדרש'),
})

const ReceiptConfigSchema = z.discriminatedUnion('provider', [
  GreenInvoiceSchema,
  ICountSchema,
  SumitSchema,
])

export type ReceiptActionState = { success: boolean; error?: string }

// ── Validate credentials against the selected provider ───────────────────────

async function testCredentials(
  data: z.infer<typeof ReceiptConfigSchema>
): Promise<string | null> {
  try {
    switch (data.provider) {
      case 'green-invoice': {
        const res = await fetch('https://api.greeninvoice.co.il/api/v1/account/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id, secret: data.secret }),
        })
        if (!res.ok) {
          return 'פרטי ה-API שגויים — לא ניתן להתחבר לחשבוניות ירוקות (Morning)'
        }
        return null
      }

      case 'icount': {
        const provider = new ICountProvider({ cid: data.cid, user: data.user, pass: data.pass })
        await provider.validateCredentials()
        return null
      }

      case 'sumit': {
        const provider = new SumitProvider({ companyId: data.companyId, apiKey: data.apiKey })
        await provider.validateCredentials()
        return null
      }
    }
  } catch {
    return 'שגיאת רשת — לא ניתן לאמת מול הספק'
  }
}

// ── Credential payload to encrypt (exclude discriminant for cleanliness) ──────

function buildCredentialPayload(
  data: z.infer<typeof ReceiptConfigSchema>
): Record<string, string> {
  switch (data.provider) {
    case 'green-invoice':
      return { id: data.id, secret: data.secret }
    case 'icount':
      return { cid: data.cid, user: data.user, pass: data.pass }
    case 'sumit':
      return { companyId: data.companyId, apiKey: data.apiKey }
  }
}

export async function saveReceiptConfigAction(
  _prev: ReceiptActionState,
  formData: FormData
): Promise<ReceiptActionState> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    forbidden()
  }

  const raw = {
    provider:  formData.get('provider'),
    // green-invoice fields
    id:        formData.get('id')        ?? '',
    secret:    formData.get('secret')    ?? '',
    // icount fields
    cid:       formData.get('cid')       ?? '',
    user:      formData.get('user')      ?? '',
    pass:      formData.get('pass')      ?? '',
    // sumit fields
    companyId: formData.get('companyId') ?? '',
    apiKey:    formData.get('apiKey')    ?? '',
  }

  const parsed = ReceiptConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? await commonError('invalidData') }
  }

  // ── Test credentials against the provider ────────────────────────────────
  const testError = await testCredentials(parsed.data)
  if (testError) {
    return { success: false, error: testError }
  }

  // ── Encrypt credential payload + persist provider type ───────────────────
  const encryptionKey = getEncryptionKey()
  const credentialPayload = buildCredentialPayload(parsed.data)
  const encrypted = encryptWithKey(JSON.stringify(credentialPayload), encryptionKey)

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({
      receipt_provider:          parsed.data.provider as ReceiptProviderType,
      receipt_config_encrypted:  encrypted,
    })
    .eq('id', orgId)

  if (error) {
    return { success: false, error: 'שגיאה בשמירת ההגדרות' }
  }

  revalidatePath('/settings/receipts')
  return { success: true }
}

export async function disconnectReceiptAction(): Promise<{ error?: string }> {
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({
      receipt_provider:         null,
      receipt_config_encrypted: null,
    })
    .eq('id', orgId)

  if (error) {
    return { error: 'שגיאה בניתוק ספק הקבלות' }
  }

  revalidatePath('/settings/receipts')
  return {}
}
