import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT } from 'jose'
import { verifyBookingToken, signBookingToken, BookingTokenError } from './index'

const SECRET = 'test-booking-jwt-secret-32-chars!!'

beforeAll(() => {
  process.env.BOOKING_JWT_SECRET = SECRET
})

const secret = () => new TextEncoder().encode(SECRET)

const PAYLOAD = {
  organizationId: 'org-1',
  parentId: 'parent-1',
  studentId: 'student-1',
}

async function makeToken(
  payload: Record<string, unknown>,
  expiresIn: string = '15m'
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret())
}

describe('verifyBookingToken', () => {
  it('returns the payload for a valid token', async () => {
    const token = await makeToken(PAYLOAD)
    const result = await verifyBookingToken(token)

    expect(result.organizationId).toBe(PAYLOAD.organizationId)
    expect(result.parentId).toBe(PAYLOAD.parentId)
    expect(result.studentId).toBe(PAYLOAD.studentId)
  })

  it('throws BookingTokenError with reason "expired" for an expired token', async () => {
    // Set exp to 1 second in the past (Unix timestamp)
    const expiredToken = await new SignJWT({ ...PAYLOAD })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(secret())

    await expect(verifyBookingToken(expiredToken)).rejects.toThrow(BookingTokenError)
    await expect(verifyBookingToken(expiredToken)).rejects.toMatchObject({ reason: 'expired' })
  })

  it('throws BookingTokenError with reason "invalid" for a tampered token', async () => {
    const token = await makeToken(PAYLOAD)
    const tampered = token.slice(0, -5) + 'XXXXX'

    await expect(verifyBookingToken(tampered)).rejects.toThrow(BookingTokenError)
    await expect(verifyBookingToken(tampered)).rejects.toMatchObject({ reason: 'invalid' })
  })

  it('throws BookingTokenError with reason "invalid" for a token missing required fields', async () => {
    const token = await makeToken({ organizationId: 'org-1' }) // missing parentId, studentId

    await expect(verifyBookingToken(token)).rejects.toThrow(BookingTokenError)
    await expect(verifyBookingToken(token)).rejects.toMatchObject({ reason: 'invalid' })
  })

  it('throws BookingTokenError with reason "invalid" for a garbage string', async () => {
    await expect(verifyBookingToken('not.a.jwt')).rejects.toThrow(BookingTokenError)
    await expect(verifyBookingToken('not.a.jwt')).rejects.toMatchObject({ reason: 'invalid' })
  })
})

describe('signBookingToken', () => {
  it('produces a token that verifyBookingToken can decode', async () => {
    const token = await signBookingToken(PAYLOAD)
    const result = await verifyBookingToken(token)

    expect(result).toEqual(PAYLOAD)
  })

  it('produced token includes only the documented fields', async () => {
    const token = await signBookingToken(PAYLOAD)
    const result = await verifyBookingToken(token)

    expect(Object.keys(result).sort()).toEqual(['organizationId', 'parentId', 'studentId'])
  })
})
