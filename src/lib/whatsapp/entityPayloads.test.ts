import { describe, expect, it } from 'vitest'

import {
  decodeEntityPayload,
  encodeAttendancePayload,
  encodeHomeworkPayload,
} from './entityPayloads'

const ID = '3f2b8a1c-9d4e-4f6a-8b2c-1e5d7a9c3b0f'

describe('encode/decode round-trips', () => {
  it('round-trips an attendance confirmation', () => {
    expect(decodeEntityPayload(encodeAttendancePayload('ok', ID))).toEqual({
      kind: 'attendance',
      action: 'ok',
      lessonId: ID,
    })
  })

  it('round-trips an attendance cancellation', () => {
    expect(decodeEntityPayload(encodeAttendancePayload('cancel', ID))).toEqual({
      kind: 'attendance',
      action: 'cancel',
      lessonId: ID,
    })
  })

  it('round-trips a homework-done tap', () => {
    expect(decodeEntityPayload(encodeHomeworkPayload(ID))).toEqual({
      kind: 'homework',
      action: 'done',
      assignmentId: ID,
    })
  })
})

describe('decodeEntityPayload rejections', () => {
  it('returns null for undefined and empty ids', () => {
    expect(decodeEntityPayload(undefined)).toBeNull()
    expect(decodeEntityPayload('')).toBeNull()
  })

  it('returns null for other namespaces so they fall through', () => {
    expect(decodeEntityPayload('m:cancel')).toBeNull()
    expect(decodeEntityPayload(`c:pick:${ID}`)).toBeNull()
    expect(decodeEntityPayload('d:abort')).toBeNull()
    expect(decodeEntityPayload(`a:approve:${ID}`)).toBeNull()
  })

  it('returns null for unknown actions inside a known namespace', () => {
    expect(decodeEntityPayload(`att:maybe:${ID}`)).toBeNull()
    expect(decodeEntityPayload(`hw:undo:${ID}`)).toBeNull()
  })

  it('returns null for malformed ids', () => {
    expect(decodeEntityPayload('att:ok:123')).toBeNull()
    expect(decodeEntityPayload('hw:done:')).toBeNull()
    expect(decodeEntityPayload(`att:ok:${ID}:extra`)).toBeNull()
  })
})
