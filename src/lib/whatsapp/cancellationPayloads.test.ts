import { describe, expect, it } from 'vitest'

import {
  decodeCancellationPayload,
  encodeCancellationPayload,
} from './cancellationPayloads'

const LESSON_ID = '3f2b8a1c-9d4e-4f6a-8b2c-1e5d7a9c3b0f'

describe('encode/decode round-trips', () => {
  it.each([
    [{ step: 'pick', lessonId: LESSON_ID }],
    [{ step: 'confirm', lessonId: LESSON_ID }],
    [{ step: 'abort' }],
    [{ step: 'page', offset: 0 }],
    [{ step: 'page', offset: 16 }],
  ] as const)('round-trips %j', (payload) => {
    expect(decodeCancellationPayload(encodeCancellationPayload(payload))).toEqual(payload)
  })
})

describe('decodeCancellationPayload rejections', () => {
  it('returns null for undefined and empty ids', () => {
    expect(decodeCancellationPayload(undefined)).toBeNull()
    expect(decodeCancellationPayload('')).toBeNull()
  })

  it('returns null for foreign namespaces so they fall through', () => {
    expect(decodeCancellationPayload('m:cancel')).toBeNull()
    expect(decodeCancellationPayload('d:abort')).toBeNull()
    expect(decodeCancellationPayload('a:approve:' + LESSON_ID)).toBeNull()
    expect(decodeCancellationPayload('sup:send')).toBeNull()
  })

  it('returns null for malformed lesson ids', () => {
    expect(decodeCancellationPayload('c:pick:123')).toBeNull()
    expect(decodeCancellationPayload('c:pick:not-a-uuid-at-all-but-36-chars-xx')).toBeNull()
    expect(decodeCancellationPayload('c:confirm:')).toBeNull()
    expect(decodeCancellationPayload(`c:pick:${LESSON_ID}:extra`)).toBeNull()
  })

  it('returns null for malformed steps and offsets', () => {
    expect(decodeCancellationPayload('c:')).toBeNull()
    expect(decodeCancellationPayload('c:unknown')).toBeNull()
    expect(decodeCancellationPayload('c:abort:extra')).toBeNull()
    expect(decodeCancellationPayload('c:page:abc')).toBeNull()
    expect(decodeCancellationPayload('c:page:-1')).toBeNull()
    expect(decodeCancellationPayload('c:page:9999')).toBeNull()
  })
})
