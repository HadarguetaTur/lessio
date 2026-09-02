import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PORTAL_SETTINGS,
  PORTAL_FEATURES,
  isPortalFeatureOn,
  normalizePortalSettings,
} from './portalSettings'

describe('normalizePortalSettings', () => {
  it('treats an empty or missing column as everything on', () => {
    expect(normalizePortalSettings({})).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(normalizePortalSettings(null)).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(normalizePortalSettings(undefined)).toEqual(DEFAULT_PORTAL_SETTINGS)
  })

  it('ignores shapes that are not an object', () => {
    expect(normalizePortalSettings([])).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(normalizePortalSettings('off')).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(normalizePortalSettings(false)).toEqual(DEFAULT_PORTAL_SETTINGS)
  })

  it('switches a feature off only on an explicit false', () => {
    const settings = normalizePortalSettings({
      payments: false,
      homework: 'false',
      exams: 0,
      progress: null,
    })
    expect(settings.payments).toBe(false)
    expect(settings.homework).toBe(true)
    expect(settings.exams).toBe(true)
    expect(settings.progress).toBe(true)
    expect(settings.enabled).toBe(true)
  })

  it('keeps unknown keys out of the result', () => {
    const settings = normalizePortalSettings({ schedule: false, home: false })
    expect(settings).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(Object.keys(settings).sort()).toEqual(['enabled', ...PORTAL_FEATURES].sort())
  })

  it('returns a fresh object each time so callers cannot mutate the defaults', () => {
    const a = normalizePortalSettings({})
    a.payments = false
    expect(DEFAULT_PORTAL_SETTINGS.payments).toBe(true)
    expect(normalizePortalSettings({}).payments).toBe(true)
  })
})

describe('isPortalFeatureOn', () => {
  it('is false for every feature while the master switch is off', () => {
    const settings = normalizePortalSettings({ enabled: false })
    for (const feature of PORTAL_FEATURES) {
      expect(isPortalFeatureOn(settings, feature), feature).toBe(false)
    }
  })

  it('follows the feature flag when the portal is open', () => {
    const settings = normalizePortalSettings({ homework: false })
    expect(isPortalFeatureOn(settings, 'homework')).toBe(false)
    expect(isPortalFeatureOn(settings, 'payments')).toBe(true)
  })
})
