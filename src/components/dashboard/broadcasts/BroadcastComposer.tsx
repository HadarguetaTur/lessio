'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Loader2, Megaphone, Send, Users } from 'lucide-react'
import type { BroadcastActionResult } from '@/app/(dashboard)/messages/broadcasts/actions'
import type { AudienceFilter, BroadcastType } from '@/lib/whatsapp/broadcast/types'

export interface AudienceOption {
  value: string
  label: string
  filter: AudienceFilter
}

export interface ComposerHealth {
  qualityRating: string
  dailyRemaining: number | null
  verified: boolean
  connected: boolean
}

interface Props {
  audiences: AudienceOption[]
  initialAudience?: string
  health: ComposerHealth
  /** Preview copy per type and language, taken from what Meta actually approved. */
  previews: Record<BroadcastType, Record<'he' | 'en', { body: string; button: string | null }>>
  messageMax: number
  topicMax: number
  createAction: (prev: BroadcastActionResult, formData: FormData) => Promise<BroadcastActionResult>
  previewAudienceAction: (
    audienceJson: string,
    type: BroadcastType
  ) => Promise<{ included: number; skipped: Array<{ reason: string; count: number }>; error: string | null }>
}

const initialState: BroadcastActionResult = { error: null }

export function BroadcastComposer({
  audiences,
  initialAudience,
  health,
  previews,
  messageMax,
  topicMax,
  createAction,
  previewAudienceAction,
}: Props) {
  const t = useTranslations('broadcasts')
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(createAction, initialState)

  const [audienceValue, setAudienceValue] = useState(initialAudience ?? audiences[0]?.value ?? '')
  const [type, setType] = useState<BroadcastType>('class_update')
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [previewLocale, setPreviewLocale] = useState<'he' | 'en'>('he')
  const [scheduled, setScheduled] = useState('')
  const [attested, setAttested] = useState(false)

  const [count, setCount] = useState<{ included: number; skipped: Array<{ reason: string; count: number }> } | null>(null)
  const [counting, startCounting] = useTransition()

  const selected = audiences.find((a) => a.value === audienceValue)
  const audienceJson = useMemo(() => (selected ? JSON.stringify(selected.filter) : ''), [selected])

  // The live count is the whole point of this screen: an owner should know how
  // many parents this reaches, and how many it skips, before pressing send.
  useEffect(() => {
    if (!audienceJson) return
    startCounting(async () => {
      const result = await previewAudienceAction(audienceJson, type)
      if (!result.error) setCount({ included: result.included, skipped: result.skipped })
    })
  }, [audienceJson, type, previewAudienceAction])

  useEffect(() => {
    if (state.campaignId && !state.error) router.push(`/messages/broadcasts/${state.campaignId}`)
  }, [state, router])

  const preview = previews[type]?.[previewLocale]
  // Meta collapses any run of whitespace in a template parameter, so a
  // multi-line announcement arrives as one line. Better to show that here.
  const flattened = message.replace(/\s+/g, ' ').trim()
  const tooLong = flattened.length > messageMax
  const promoBlocked = type === 'promo' && !health.verified

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="audience" value={audienceJson} />
      <input type="hidden" name="message" value={flattened} />

      <div className="space-y-5">
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <div>
            <label htmlFor="bc-name" className="block text-sm font-medium mb-1">
              {t('form.name')}
            </label>
            <input
              id="bc-name"
              name="name"
              required
              maxLength={120}
              placeholder={t('form.namePlaceholder')}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium mb-2">{t('form.type')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['class_update', 'promo'] as const).map((option) => (
                <label
                  key={option}
                  className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm ${
                    type === option ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="template_type"
                      value={option}
                      checked={type === option}
                      onChange={() => setType(option)}
                    />
                    {t(`typeChoice.${option}.title`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`typeChoice.${option}.hint`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="bc-audience" className="block text-sm font-medium mb-1">
              {t('form.audience')}
            </label>
            <select
              id="bc-audience"
              value={audienceValue}
              onChange={(e) => setAudienceValue(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {audiences.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {type === 'class_update' && (
            <div>
              <label htmlFor="bc-topic" className="block text-sm font-medium mb-1">
                {t('form.topic')}
              </label>
              <input
                id="bc-topic"
                name="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={topicMax}
                placeholder={t('form.topicPlaceholder')}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label htmlFor="bc-message" className="block text-sm font-medium mb-1">
              {t('form.message')}
            </label>
            <textarea
              id="bc-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={t('form.messagePlaceholder')}
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('form.oneParagraph')}</span>
              <span className={tooLong ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                {flattened.length} / {messageMax}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="bc-schedule" className="block text-sm font-medium mb-1">
              {t('form.schedule')}
            </label>
            <input
              id="bc-schedule"
              type="datetime-local"
              name="scheduled_at"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('form.scheduleHint')}</p>
          </div>

          {type === 'promo' && (
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
              <input
                type="checkbox"
                name="consent_attested"
                value="on"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t('form.consentAttest')}</span>
            </label>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('preview.title')}</h2>
            <div className="flex gap-1">
              {(['he', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setPreviewLocale(l)}
                  className={`rounded px-2 py-1 text-xs ${
                    previewLocale === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t(`preview.${l}`)}
                </button>
              ))}
            </div>
          </div>
          <div
            className="rounded-lg bg-[#dcf8c6] p-3 text-sm text-gray-900 whitespace-pre-wrap"
            dir={previewLocale === 'he' ? 'rtl' : 'ltr'}
          >
            {renderPreview(
              preview?.body ?? '',
              type === 'class_update'
                ? [
                    t('preview.orgSample'),
                    topic || t('preview.topicSample'),
                    flattened || t('preview.messageSample'),
                  ]
                : [t('preview.orgSample'), flattened || t('preview.messageSample')]
            )}
            {preview?.button && (
              <div className="mt-2 border-t border-black/10 pt-2 text-center text-[#00a5f4]">
                {preview.button}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('preview.note')}</p>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Users size={15} />
            {t('side.audienceTitle')}
          </h2>
          {counting || !count ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              {t('side.counting')}
            </p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">{count.included}</p>
              <p className="text-xs text-muted-foreground">{t('side.willReceive')}</p>
              {count.skipped.length > 0 && (
                <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  {count.skipped.map((s) => (
                    <li key={s.reason} className="flex justify-between gap-2">
                      <span>{t(`skipReasons.${s.reason}`)}</span>
                      <span className="tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4 text-xs space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Megaphone size={15} />
            {t('side.healthTitle')}
          </h2>
          <Row label={t('side.quality')} value={t(`quality.${health.qualityRating}`)} />
          <Row
            label={t('side.dailyLeft')}
            value={health.dailyRemaining === null ? t('side.unknown') : String(health.dailyRemaining)}
          />
          <Row
            label={t('side.verified')}
            value={health.verified ? t('side.yes') : t('side.no')}
          />
        </section>

        {promoBlocked && (
          <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {t('blocked.promo_needs_verification')}
          </p>
        )}

        {state.error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {state.guardReason
              ? t(`blocked.${state.guardReason}`)
              : t(`errors.${state.error}`)}
          </p>
        )}

        <button
          type="submit"
          disabled={
            isPending ||
            tooLong ||
            flattened.length === 0 ||
            !audienceJson ||
            promoBlocked ||
            (type === 'promo' && !attested) ||
            (count?.included ?? 0) === 0
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {scheduled ? t('form.submitScheduled') : t('form.submitNow')}
        </button>
      </aside>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

/**
 * Fills a registered body's numbered placeholders.
 *
 * Positional, because that is what Meta does: class_update takes three
 * parameters and promo takes two, and {{2}} means a different thing in each.
 */
function renderPreview(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, index) => params[Number(index) - 1] ?? match)
}
