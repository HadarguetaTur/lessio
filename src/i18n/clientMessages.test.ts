import { describe, expect, it } from 'vitest'

import type { AbstractIntlMessages } from 'next-intl'

import heJson from '../../messages/he.json'
import enJson from '../../messages/en.json'
import {
  ADMIN_MESSAGE_NAMESPACES,
  BOOKING_MESSAGE_NAMESPACES,
  DASHBOARD_MESSAGE_NAMESPACES,
  ONBOARDING_MESSAGE_NAMESPACES,
  PORTAL_MESSAGE_NAMESPACES,
  ROOT_MESSAGE_NAMESPACES,
  pickMessages,
} from './clientMessages'

describe('pickMessages', () => {
  const messages = {
    common: { save: 'שמור', cancel: 'בטל' },
    admin: { supportBanner: 'x', readOnly: 'y', orgs: { exitSupport: 'z', other: 'w' } },
    settings: { title: 't' },
  }

  it('keeps whole namespaces and drops the rest', () => {
    expect(pickMessages(messages, ['common'])).toEqual({ common: messages.common })
  })

  it('picks dotted paths without dragging in their siblings', () => {
    expect(pickMessages(messages, ['admin.supportBanner', 'admin.orgs.exitSupport'])).toEqual({
      admin: { supportBanner: 'x', orgs: { exitSupport: 'z' } },
    })
  })

  it('ignores paths that do not exist', () => {
    expect(pickMessages(messages, ['nope', 'admin.missing.deep'])).toEqual({})
  })

  it('does not mutate the source', () => {
    const before = JSON.stringify(messages)
    pickMessages(messages, ['admin.orgs.exitSupport', 'common'])
    expect(JSON.stringify(messages)).toBe(before)
  })
})

// The JSON imports are typed as their literal shape; next-intl wants the
// generic message map.
const he = heJson as unknown as AbstractIntlMessages
const en = enJson as unknown as AbstractIntlMessages

describe('area namespace lists', () => {
  const lists = {
    ROOT_MESSAGE_NAMESPACES,
    DASHBOARD_MESSAGE_NAMESPACES,
    ADMIN_MESSAGE_NAMESPACES,
    PORTAL_MESSAGE_NAMESPACES,
    BOOKING_MESSAGE_NAMESPACES,
    ONBOARDING_MESSAGE_NAMESPACES,
  }

  it.each(Object.entries(lists))('%s names only paths that exist in both languages', (_name, list) => {
    for (const path of list) {
      for (const [locale, messages] of [['he', he], ['en', en]] as const) {
        const picked = pickMessages(messages, [path])
        expect(Object.keys(picked).length, `${path} missing in ${locale}`).toBe(1)
      }
    }
  })

  it('the dashboard bundle is materially smaller than the full catalog', () => {
    const full = JSON.stringify(he).length
    const picked = JSON.stringify(pickMessages(he, DASHBOARD_MESSAGE_NAMESPACES)).length
    expect(picked).toBeLessThan(full * 0.85)
  })

  it('the root bundle carries none of the dashboard copy', () => {
    const picked = pickMessages(he, ROOT_MESSAGE_NAMESPACES)
    expect(picked).not.toHaveProperty('settings')
    expect(picked).not.toHaveProperty('admin')
    expect(picked).not.toHaveProperty('students')
  })
})
