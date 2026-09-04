/**
 * Regression lock for UX audit 8, F-C1.
 *
 * Both PDF generators selected `students.first_name, last_name` — columns that
 * have never existed; the tables carry `full_name`. Because approval calls
 * generation fire-and-forget with `.catch(console.error)`, every invoice and
 * every credit note failed invisibly for every org since the feature shipped.
 *
 * These tests assert the columns actually sent to PostgREST, which is the layer
 * that broke. They stop before the PDF renders — the org lookup is left empty
 * so generation throws once the selects under test have been captured.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

const BILLING = {
  id: 'b1',
  student_id: 's1',
  parent_id: 'p1',
  billing_month: '2026-09',
  total_amount: 240,
  // An invoice number is present but no PDF url: the invoice generator treats
  // that as "not yet issued" and proceeds, while the credit-note generator
  // requires an invoice to exist at all. One fixture drives both paths.
  invoice_number: 'INV-2026-0001',
  invoice_pdf_url: null,
  credit_note_number: null,
  credit_note_pdf_url: null,
}

/** Records every (table, columns) pair the generator asks Postgres for. */
function mockDbCapturing(selects: Array<{ table: string; columns: string }>) {
  mockCreateServiceRoleClient.mockReturnValue({
    from: (table: string) => ({
      select: (columns: string) => {
        selects.push({ table, columns })
        const row =
          table === 'student_monthly_billing' ? BILLING
          : table === 'students' ? { id: 's1', full_name: 'רוני פרידמן' }
          : table === 'parents' ? { id: 'p1', full_name: 'דנה פרידמן', preferred_locale: 'he' }
          : null // organizations → null, so generation stops before rendering
        const chain = {
          eq: () => chain,
          single: async () => ({ data: row, error: row ? null : { message: 'not found' } }),
          maybeSingle: async () => ({ data: row, error: null }),
        }
        return chain
      },
    }),
  })
}

function columnsFor(selects: Array<{ table: string; columns: string }>, table: string): string[] {
  return selects.filter((s) => s.table === table).map((s) => s.columns)
}

describe('invoice and credit-note generators use columns that exist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['invoice', async () => (await import('./generateInvoicePdf')).generateAndStoreInvoice],
    ['credit note', async () => (await import('./generateCreditNotePdf')).generateAndStoreCreditNote],
  ])('%s: selects full_name, never first_name/last_name', async (_label, load) => {
    const selects: Array<{ table: string; columns: string }> = []
    mockDbCapturing(selects)

    const generate = await load()
    // Throws at the organizations lookup — by then the selects under test ran.
    await expect(generate('b1', 'org-1')).rejects.toThrow()

    const studentCols = columnsFor(selects, 'students')
    const parentCols = columnsFor(selects, 'parents')

    expect(studentCols.length).toBeGreaterThan(0)
    expect(parentCols.length).toBeGreaterThan(0)

    for (const cols of [...studentCols, ...parentCols]) {
      expect(cols).toContain('full_name')
      expect(cols).not.toMatch(/\bfirst_name\b/)
      expect(cols).not.toMatch(/\blast_name\b/)
    }
  })
})
