'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { PORTAL_FEATURES, type PortalSettings } from '@/lib/organizations/portalSettings'
import { saveParentPortalSettings, type ParentPortalActionState } from './actions'

const initialState: ParentPortalActionState = { error: null }

export function ParentPortalForm({ settings }: { settings: PortalSettings }) {
  const t = useTranslations('settings.parentPortal')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveParentPortalSettings, initialState)
  // Local, so the feature list dims the moment the master switch is unticked
  // rather than after a save — an owner switching the portal off should not be
  // left wondering whether the rows below still mean anything.
  const [portalOpen, setPortalOpen] = useState(settings.enabled)

  return (
    <form action={formAction} className="space-y-6">
      {/* Master switch */}
      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span className="block">
          <span className="block text-sm font-medium text-gray-900">{t('enabled.label')}</span>
          <span className="block text-xs text-muted-foreground mt-0.5">{t('enabled.hint')}</span>
        </span>
        <span className="relative inline-flex items-center shrink-0 mt-0.5">
          <input
            type="checkbox"
            name="enabled"
            value="on"
            defaultChecked={settings.enabled}
            onChange={(e) => setPortalOpen(e.target.checked)}
            className="sr-only peer"
          />
          <span className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-700" />
        </span>
      </label>

      <hr className="border-gray-100" />

      {/* Per-feature toggles. Still submitted while the portal is closed, so
          reopening it restores exactly the set the owner had chosen. */}
      <fieldset
        className={`space-y-0 transition-opacity ${portalOpen ? '' : 'opacity-50'}`}
        aria-describedby={portalOpen ? undefined : 'portal-closed-note'}
      >
        <legend className="text-sm font-medium text-gray-900 mb-1">{t('featuresTitle')}</legend>
        <p className="text-xs text-muted-foreground mb-2">{t('featuresHint')}</p>
        {!portalOpen && (
          <p id="portal-closed-note" className="text-xs text-amber-700 mb-2">
            {t('closedNote')}
          </p>
        )}

        {PORTAL_FEATURES.map((feature, i) => (
          <label
            key={feature}
            className={`flex items-start justify-between gap-4 py-4 cursor-pointer ${
              i < PORTAL_FEATURES.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-gray-900">
                {t(`features.${feature}.label`)}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t(`features.${feature}.description`)}
              </span>
            </span>
            <span className="relative inline-flex items-center shrink-0 mt-0.5">
              <input
                type="checkbox"
                name={feature}
                value="on"
                defaultChecked={settings[feature]}
                className="sr-only peer"
              />
              <span className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-700" />
            </span>
          </label>
        ))}
      </fieldset>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{t('saved')}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending && <Loader2 size={14} className="animate-spin" />}
        {tCommon('actions.save')}
      </button>
    </form>
  )
}
