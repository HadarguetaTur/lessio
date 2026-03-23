import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock auth client ──────────────────────────────────────────────────────────

const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ rpc: mockRpc }),
}))

import { convertLead } from './convertLead'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('convertLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when phone already exists as parent (blocked with clear error)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'phone_already_parent' },
    })

    await expect(
      convertLead('lead-1', 'org-1', { parentFullName: 'שרה', studentFullName: 'ישראל' })
    ).rejects.toThrow('[convertLead] Phone already exists as a parent')
  })

  it('throws when lead is already converted', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'lead_already_converted' },
    })

    await expect(
      convertLead('lead-1', 'org-1', { parentFullName: 'שרה', studentFullName: 'ישראל' })
    ).rejects.toThrow('[convertLead] Lead is already converted')
  })

  it('throws when lead is not found', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'lead_not_found' },
    })

    await expect(
      convertLead('lead-x', 'org-1', { parentFullName: 'שרה', studentFullName: 'ישראל' })
    ).rejects.toThrow('[convertLead] Lead not found')
  })

  it('passes validated payload to the transactional RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ parent_id: 'parent-new', student_id: 'student-new' }],
      error: null,
    })

    const result = await convertLead('lead-1', 'org-1', {
      parentFullName: 'שרה כהן',
      studentFullName: 'ישראל ישראלי',
      grade: 'ח',
    })

    expect(result.parentId).toBe('parent-new')
    expect(result.studentId).toBe('student-new')
    expect(mockRpc).toHaveBeenCalledWith('convert_lead', {
      p_lead_id: 'lead-1',
      p_org_id: 'org-1',
      p_parent_full_name: 'שרה כהן',
      p_student_full_name: 'ישראל ישראלי',
      p_grade: 'ח',
    })
  })

  it('throws when the RPC returns an unexpected failure', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'insert failed' },
    })

    await expect(
      convertLead('lead-1', 'org-1', { parentFullName: 'שרה', studentFullName: 'ישראל' })
    ).rejects.toThrow('[convertLead] Failed to convert lead: insert failed')
  })

  it('throws when the RPC succeeds without ids', async () => {
    mockRpc.mockResolvedValue({
      data: [{ parent_id: null, student_id: null }],
      error: null,
    })

    await expect(
      convertLead('lead-1', 'org-1', { parentFullName: 'שרה', studentFullName: 'ישראל' })
    ).rejects.toThrow('[convertLead] Failed to convert lead: missing return payload')
  })
})
