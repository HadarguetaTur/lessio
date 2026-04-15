import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getRevenueReport } from '@/lib/reports/revenue'
import { getTeachersReport } from '@/lib/reports/teachers'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}))

vi.mock('@/lib/organizations', () => ({
  getOrgTimezone: vi.fn(),
}))

vi.mock('@/lib/reports/revenue', () => ({
  getRevenueReport: vi.fn(),
}))

vi.mock('@/lib/reports/lessons', () => ({
  getLessonsReport: vi.fn(),
}))

vi.mock('@/lib/reports/debt', () => ({
  getDebtReport: vi.fn(),
}))

vi.mock('@/lib/reports/teachers', () => ({
  getTeachersReport: vi.fn(),
}))

vi.mock('@/lib/reports/students', () => ({
  getStudentsReport: vi.fn(),
}))

const mockGetSession = vi.mocked(getSession)
const mockGetOrgTimezone = vi.mocked(getOrgTimezone)
const mockGetRevenueReport = vi.mocked(getRevenueReport)
const mockGetTeachersReport = vi.mocked(getTeachersReport)

describe('GET /api/reports/[report]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      userId: 'user-1',
      profileId: 'profile-1',
      orgId: 'org-1',
      role: 'owner',
      fullName: 'Owner User',
    })
    mockGetOrgTimezone.mockResolvedValue('UTC')
  })

  it('falls back to the default revenue period when months is invalid', async () => {
    mockGetRevenueReport.mockResolvedValue({
      buckets: [{ month: '2026-04', label: 'אפריל 2026', revenue: 1250, billingTotal: 300, billingPaid: 120 }],
      total: 1250,
      billingTotal: 300,
      billingPaid: 120,
    })

    const request = new NextRequest('https://example.com/api/reports/revenue?months=abc')
    const response = await GET(request, {
      params: Promise.resolve({ report: 'revenue' }),
    })

    expect(response.status).toBe(200)
    expect(mockGetRevenueReport).toHaveBeenCalledWith('org-1', 'UTC', 12, expect.any(String))
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const csv = new TextDecoder().decode(bytes)
    expect(csv).toContain('חיוב חודשי (₪)')
    expect(csv).toContain('300.00')
    expect(csv).toContain('120.00')
  })

  it('clamps the teachers CSV export period to 12 months', async () => {
    mockGetTeachersReport.mockResolvedValue({
      rows: [{ teacherId: 'teacher-1', teacherName: 'מורה', lessonsCount: 8, revenue: 900 }],
    })

    const request = new NextRequest('https://example.com/api/reports/teachers?months=24')
    const response = await GET(request, {
      params: Promise.resolve({ report: 'teachers' }),
    })

    expect(response.status).toBe(200)
    expect(mockGetTeachersReport).toHaveBeenCalledWith('org-1', 'UTC', 12)
  })
})
