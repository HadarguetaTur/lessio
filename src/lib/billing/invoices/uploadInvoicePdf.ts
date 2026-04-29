import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'invoices'
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60 // 24 hours

/**
 * Uploads a PDF buffer to the `invoices` storage bucket.
 *
 * Storage path: `{orgId}/{year}/{fileName}.pdf`
 *
 * @returns The storage path (not a URL — use `getInvoiceSignedUrl` to get a download URL).
 */
export async function uploadInvoicePdf(
  orgId: string,
  year: number,
  fileName: string,
  pdfBuffer: Buffer
): Promise<string> {
  const supabase = createServiceRoleClient()
  const storagePath = `${orgId}/${year}/${fileName}.pdf`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (error) {
    throw new Error(
      `[uploadInvoicePdf] failed to upload ${storagePath}: ${error.message}`
    )
  }

  return storagePath
}

/**
 * Returns a signed URL for downloading an invoice PDF.
 * The URL is valid for 24 hours.
 */
export async function getInvoiceSignedUrl(path: string): Promise<string> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw new Error(
      `[getInvoiceSignedUrl] failed to create signed URL for ${path}: ${error?.message ?? 'no URL returned'}`
    )
  }

  return data.signedUrl
}
