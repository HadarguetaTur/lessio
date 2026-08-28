/**
 * Response envelope for /api/v1 — server-only.
 *
 * Every response is JSON and has exactly one of two shapes:
 *   success  { "data": … }
 *   failure  { "error": { "code": "…", "message": "…" } }
 *
 * `code` is a stable machine-readable string an automation can branch on;
 * `message` is English prose for a human reading a Make execution log. Neither
 * goes through next-intl: the audience is a scenario builder, not the org's
 * parents, and an error string that changes with a cookie is untestable.
 */

import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'feature_unavailable'
  | 'quota_exceeded'
  | 'conflict'
  | 'internal_error'

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 422,
  rate_limited: 429,
  feature_unavailable: 403,
  quota_exceeded: 403,
  conflict: 409,
  internal_error: 500,
}

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    /** Extra headers to set on the response, e.g. Retry-After on a 429. */
    public readonly headers?: Record<string, string>
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get status(): number {
    return STATUS_BY_CODE[this.code]
  }
}

export function apiSuccess(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ data }, { status })
}

export function apiFailure(error: ApiError): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: error.headers }
  )
}
