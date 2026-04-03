'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { forbidden } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { encryptWithKey } from '@/lib/crypto'

function getEncryptionKey(): string {
  const key = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('[receipts/settings] PAYMENT_CONFIG_ENCRYPTION_KEY missing or invalid')
  }
  return key
}

const GREEN_INVOICE_BASE = 'https://api.greeninvoice.co.il/api/v1'

const GreenInvoiceSchema = z.object({
  id:     z.string().min(1, 'API ID נדרש'),
  secret: z.string().min(1, 'Secret נדרש'),
})

export type ReceiptActionState = { success: boolean; error?: string }

export async function saveReceiptConfigAction(
  _prev: ReceiptActionState,
  formData: FormData
): Promise<ReceiptActionState> {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  const raw = {
    id:     formData.get('id')     as string,
    secret: formData.get('secret') as string,
  }

  const parsed = GreenInvoiceSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  // ── Test credentials against Green Invoice token endpoint ─────────────────
  try {
    const res = await fetch(`${GREEN_INVOICE_BASE}/account/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parsed.data.id, secret: parsed.data.secret }),
    })
    if (!res.ok) {
      return { success: false, error: 'פרטי ה-API שגויים — לא ניתן להתחבר ל-חשבוניות ירוקות' }
    }
  } catch {
    return { success: false, error: 'שגיאת רשת — לא ניתן לאמת מול חשבוניות ירוקות' }
  }

  // ── Encrypt and persist ────────────────────────────────────────────────────
  const encryptionKey = getEncryptionKey()
  const encrypted = encryptWithKey(JSON.stringify(parsed.data), encryptionKey)

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ receipt_config_encrypted: encrypted })
    .eq('id', orgId)

  if (error) {
    return { success: false, error: 'שגיאה בשמירת ההגדרות' }
  }

  revalidatePath('/settings/receipts')
  return { success: true }
}

export async function disconnectReceiptAction(): Promise<{ error?: string }> {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ receipt_config_encrypted: null })
    .eq('id', orgId)

  if (error) {
    return { error: 'שגיאה בניתוק חשבוניות ירוקות' }
  }

  revalidatePath('/settings/receipts')
  return {}
}
