import { describe, expect, it } from 'vitest'
import { nextStatus } from './transitions'
import type { ProspectStatus, ReplyClassification } from './types'

const t = (s: ProspectStatus, c: ReplyClassification) => nextStatus(s, c)

describe('nextStatus', () => {
  it('a first reply moves a sent prospect', () => {
    expect(t('sent', 'interested')).toBe('interested')
    expect(t('sent', 'not_interested')).toBe('not_interested')
    expect(t('sent', 'unsubscribe')).toBe('unsubscribed')
    expect(t('sent', 'bounce')).toBe('bounced')
    expect(t('sent', 'unknown')).toBe('replied')
    expect(t('sent', 'auto_reply')).toBeNull()
  })

  it('a reply that races the /sent callback still counts', () => {
    expect(t('claimed', 'interested')).toBe('interested')
    expect(t('failed', 'interested')).toBe('interested')
  })

  it('an unknown reply followed by a yes lands', () => {
    expect(t('replied', 'unknown')).toBeNull()
    expect(t('replied', 'interested')).toBe('interested')
  })

  it('interested and not_interested can still opt out', () => {
    expect(t('interested', 'unsubscribe')).toBe('unsubscribed')
    expect(t('not_interested', 'unsubscribe')).toBe('unsubscribed')
    expect(t('interested', 'interested')).toBeNull()
    expect(t('not_interested', 'interested')).toBeNull()
  })

  it('terminal states never move', () => {
    for (const s of ['unsubscribed', 'bounced', 'converted'] as const) {
      for (const c of ['interested', 'not_interested', 'unsubscribe', 'bounce', 'unknown', 'auto_reply'] as const) {
        expect(t(s, c)).toBeNull()
      }
    }
  })

  it('queued and suppressed prospects only move on a bounce', () => {
    expect(t('queued', 'interested')).toBeNull()
    expect(t('suppressed', 'interested')).toBeNull()
    expect(t('queued', 'bounce')).toBe('bounced')
  })
})
