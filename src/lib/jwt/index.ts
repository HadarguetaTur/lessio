/**
 * JWT utilities for the booking WebView.
 * Per /docs/sprint-1-scope.md § Booking link generation and dispatch.
 *
 * verifyBookingToken — validates the signed booking JWT and returns its payload.
 * signBookingToken   — signs a new booking JWT (implemented in DEV-12).
 *
 * BOOKING_JWT_SECRET must never appear in client components.
 */

import { jwtVerify, SignJWT, type JWTPayload } from 'jose'

export interface BookingTokenPayload {
  organizationId: string
  parentId: string
  studentId: string
}

export class BookingTokenError extends Error {
  constructor(
    message: string,
    public readonly reason: 'expired' | 'invalid'
  ) {
    super(message)
    this.name = 'BookingTokenError'
  }
}

function getSecret(): Uint8Array {
  const secret = process.env.BOOKING_JWT_SECRET
  if (!secret) throw new Error('BOOKING_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

/**
 * Verifies a booking JWT and returns its payload.
 * Throws BookingTokenError with reason 'expired' or 'invalid'.
 */
export async function verifyBookingToken(token: string): Promise<BookingTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getSecret())

    const { organizationId, parentId, studentId } = payload as JWTPayload & Record<string, unknown>

    if (
      typeof organizationId !== 'string' ||
      typeof parentId !== 'string' ||
      typeof studentId !== 'string'
    ) {
      throw new BookingTokenError('Token payload is missing required fields', 'invalid')
    }

    return { organizationId, parentId, studentId }
  } catch (err) {
    if (err instanceof BookingTokenError) throw err

    // jose throws JWTExpired (code: 'ERR_JWT_EXPIRED') for expired tokens
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ERR_JWT_EXPIRED'
    ) {
      throw new BookingTokenError('Booking link has expired', 'expired')
    }

    throw new BookingTokenError('Invalid booking token', 'invalid')
  }
}

/**
 * Signs a booking JWT with a 15-minute expiry.
 * Used by the WhatsApp webhook handler (DEV-12).
 */
export async function signBookingToken(payload: BookingTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret())
}
