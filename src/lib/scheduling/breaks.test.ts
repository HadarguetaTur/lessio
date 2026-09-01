import { describe, it, expect } from 'vitest'
import { resolveBreakMinutes } from './breaks'

describe('resolveBreakMinutes', () => {
  it('follows the organization when the teacher has no preference', () => {
    expect(resolveBreakMinutes(15, null)).toBe(15)
  })

  it('lets a teacher ask for more than the organization default', () => {
    expect(resolveBreakMinutes(15, 30)).toBe(30)
  })

  it('lets a teacher ask for less', () => {
    expect(resolveBreakMinutes(30, 10)).toBe(10)
  })

  // The reason this is `??` and not `||`: a teacher who teaches back-to-back
  // said so on purpose, and must not silently acquire a break when the business
  // raises its default.
  it('treats an explicit 0 as a decision, not as "unset"', () => {
    expect(resolveBreakMinutes(15, 0)).toBe(0)
  })

  it('defaults to no break when neither level sets one', () => {
    expect(resolveBreakMinutes(0, null)).toBe(0)
  })
})
