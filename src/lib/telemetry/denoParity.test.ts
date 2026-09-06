/**
 * The error feed groups failures by fingerprint, and the threshold that opens a
 * dev_issue counts events per group. Edge Functions now write to that same feed
 * through a Deno mirror of the fingerprint, so the two implementations must
 * agree: if they drift, one bug hitting both a server action and a cron becomes
 * two half-sized groups and neither ever crosses the threshold. Nothing about
 * that failure is visible — the feed keeps filling and the issues stop coming.
 *
 * supabase/functions/_shared/errorFingerprint.ts is deliberately import-free so
 * Vitest can load it and compare real outputs, rather than diffing the files
 * (which would only ever report the CRLF/LF difference between the trees).
 */

import { describe, it, expect } from 'vitest'
import {
  fingerprintError as nodeFingerprint,
  normalizeMessage as nodeNormalizeMessage,
  normalizeRoute as nodeNormalizeRoute,
} from './fingerprint'
import {
  fingerprintError as denoFingerprint,
  normalizeMessage as denoNormalizeMessage,
  normalizeRoute as denoNormalizeRoute,
} from '../../../supabase/functions/_shared/errorFingerprint'

/** Each exercises a different normalizer, in the order they are applied. */
const MESSAGES = [
  'Student 3f2a8c5e-1111-4222-8333-444455556666 not found',
  'No parent for +972501234567',
  'Lesson at 2026-08-26T09:00:00Z was gone',
  'Bad address dana@example.com here',
  'POST https://graph.facebook.com/v19.0/x failed',
  'Token a3f9c1d8b7e6f5a4c3b2a1908f7e6d5c is invalid',
  "Column 'whatsapp_access_token' does not exist",
  'Charge 4821 failed',
  'decrypt: unsupported state or unable to authenticate data',
  '',
]

const ROUTES = [
  'lesson-reminders',
  'homework-sender',
  '/students/3f2a8c5e-1111-4222-8333-444455556666/edit',
  '/billing/2026/08',
  '/charges?status=pending',
  '',
]

describe('error fingerprint: Node ↔ Deno', () => {
  it('normalizes every message identically', () => {
    for (const message of MESSAGES) {
      expect(denoNormalizeMessage(message)).toBe(nodeNormalizeMessage(message))
    }
  })

  it('normalizes every route identically', () => {
    for (const route of ROUTES) {
      expect(denoNormalizeRoute(route)).toBe(nodeNormalizeRoute(route))
    }
  })

  it('produces the same hash, so one bug stays one group', async () => {
    for (const message of MESSAGES) {
      for (const route of ROUTES) {
        const input = { name: 'Error', message, route }
        expect(await denoFingerprint(input)).toBe(nodeFingerprint(input))
      }
    }
  })

  it('agrees on the defaults for a thrown non-Error with no route', async () => {
    expect(await denoFingerprint({})).toBe(nodeFingerprint({}))
    expect(await denoFingerprint({ name: 'NonError', message: 'undefined' })).toBe(
      nodeFingerprint({ name: 'NonError', message: 'undefined' })
    )
  })

  it('still separates two genuinely different failures', async () => {
    const a = await denoFingerprint({ name: 'Error', message: 'boom', route: 'lesson-reminders' })
    const b = await denoFingerprint({ name: 'Error', message: 'boom', route: 'homework-sender' })
    expect(a).not.toBe(b)
  })
})
