import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCompleteDueLessons } = vi.hoisted(() => ({ mockCompleteDueLessons: vi.fn() }))
vi.mock('@/lib/lessons/completeLesson', () => ({ completeDueLessons: mockCompleteDueLessons }))

import { POST } from './route'

describe('automatic lesson completion route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')
  })

  it('rejects calls without the cron bearer token', async () => {
    const response = await POST(new NextRequest('http://localhost/api/internal/lessons/auto-complete', { method: 'POST' }))
    expect(response.status).toBe(401)
    expect(mockCompleteDueLessons).not.toHaveBeenCalled()
  })

  it('runs completion for an authenticated cron call', async () => {
    const summary = { scanned: 2, completed: 2, retried: 0, warnings: 0, errors: 0 }
    mockCompleteDueLessons.mockResolvedValue(summary)
    const response = await POST(new NextRequest('http://localhost/api/internal/lessons/auto-complete', {
      method: 'POST', headers: { authorization: 'Bearer test-service-role-key' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(summary)
    expect(mockCompleteDueLessons).toHaveBeenCalledOnce()
  })
})
