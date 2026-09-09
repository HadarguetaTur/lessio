import { CheckCircle, Circle, ShieldCheck, ExternalLink } from 'lucide-react'
import { getTranslations, getLocale } from 'next-intl/server'
import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isInWarmUp, tierDailyLimit, WARM_UP_DAYS, type WaQualityRating } from '@/lib/whatsapp/health'
import type { VerificationChecklistId } from '@/lib/whatsapp/verificationChecklist'
import { RefreshHealthButton, TrustChecklist } from './TrustChecklist'

/**
 * Verification & trust — where the number stands with Meta, and what each next
 * step unlocks (broadcasts Phase 0.4).
 *
 * Three rungs: connected → business verified → Official Business Account.
 * Verification lifts the 250/day cap to 2,000 and is the gate on marketing
 * broadcasts and linked groups; OBA is the only gate on the Groups API. Meta
 * forbids submitting verification for a customer, so the card prepares and
 * points, it does not collect.
 */
export async function TrustCard({ orgId }: { orgId: string }) {
  const t = await getTranslations('settings.whatsappTrust')
  const locale = await getLocale()

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select(
      'whatsapp_business_id, whatsapp_waba_id, wa_quality_rating, wa_messaging_limit_tier, wa_is_oba, wa_oba_status, wa_business_verification_status, wa_name_status, wa_health_checked_at, wa_connected_at, wa_verification_checklist, timezone'
    )
    .eq('id', orgId)
    .maybeSingle()

  if (!org) return null

  const quality = (org.wa_quality_rating ?? 'UNKNOWN') as WaQualityRating
  const dailyLimit = tierDailyLimit(org.wa_messaging_limit_tier)
  const verified = (org.wa_business_verification_status ?? '').toLowerCase() === 'verified'
  const verificationPending = (org.wa_business_verification_status ?? '').toLowerCase() === 'pending'
  const isOba = Boolean(org.wa_is_oba)
  const warmUp = isInWarmUp(org.wa_connected_at)
  const ticked = (org.wa_verification_checklist ?? {}) as Partial<Record<VerificationChecklistId, string>>

  const daysConnected = org.wa_connected_at
    ? Math.floor(DateTime.now().diff(DateTime.fromISO(org.wa_connected_at), 'days').days)
    : null
  const obaEligible =
    verified && (daysConnected ?? 0) >= 30 && (org.wa_name_status ?? '').toUpperCase() === 'APPROVED'

  const checkedAtLabel = org.wa_health_checked_at
    ? DateTime.fromISO(org.wa_health_checked_at)
        .setZone(org.timezone ?? 'Asia/Jerusalem')
        .setLocale(locale)
        .toFormat('dd.MM HH:mm')
    : null

  const securityCentreUrl = org.whatsapp_business_id
    ? `https://business.facebook.com/settings/security?business_id=${org.whatsapp_business_id}`
    : 'https://business.facebook.com/settings/security'
  const phoneNumbersUrl =
    org.whatsapp_business_id && org.whatsapp_waba_id
      ? `https://business.facebook.com/wa/manage/phone-numbers/?business_id=${org.whatsapp_business_id}&waba_id=${org.whatsapp_waba_id}`
      : 'https://business.facebook.com/wa/manage/phone-numbers/'

  const qualityStyle: Record<WaQualityRating, string> = {
    GREEN: 'bg-green-50 text-green-700 border-green-200',
    YELLOW: 'bg-amber-50 text-amber-700 border-amber-200',
    RED: 'bg-red-50 text-red-700 border-red-200',
    UNKNOWN: 'bg-gray-50 text-gray-600 border-gray-200',
  }

  return (
    <section className="mt-6 bg-white rounded-lg border border-gray-200 p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-blue-600" />
            {t('title')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
      </div>

      {/* Health row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${qualityStyle[quality]}`}>
          {t(`quality.${quality}`)}
        </span>
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
          {dailyLimit === null
            ? t('limitUnknown')
            : dailyLimit === Number.POSITIVE_INFINITY
              ? t('limitUnlimited')
              : t('limitPerDay', { n: dailyLimit.toLocaleString(locale) })}
        </span>
        {warmUp && (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
            {t('warmUp', { days: WARM_UP_DAYS })}
          </span>
        )}
      </div>
      {quality === 'RED' && <p className="text-xs text-red-700">{t('qualityRedHint')}</p>}
      {quality === 'YELLOW' && <p className="text-xs text-amber-700">{t('qualityYellowHint')}</p>}
      <RefreshHealthButton checkedAtLabel={checkedAtLabel} />

      <hr className="border-gray-100" />

      {/* Ladder */}
      <ol className="space-y-4">
        <Rung done label={t('rungs.connected.title')} detail={t('rungs.connected.detail')} />
        <Rung
          done={verified}
          pending={verificationPending}
          label={t('rungs.verified.title')}
          detail={verified ? t('rungs.verified.done') : t('rungs.verified.detail')}
        >
          {!verified && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-700">{t('rungs.verified.howto')}</p>
              <TrustChecklist ticked={ticked} />
              <a
                href={securityCentreUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                {t('rungs.verified.openSecurityCentre')}
                <ExternalLink size={12} />
              </a>
              <p className="text-[11px] text-muted-foreground">{t('rungs.verified.noUpload')}</p>
            </div>
          )}
        </Rung>
        <Rung
          done={isOba}
          pending={(org.wa_oba_status ?? '').toUpperCase() === 'PENDING'}
          label={t('rungs.oba.title')}
          detail={isOba ? t('rungs.oba.done') : t('rungs.oba.detail')}
        >
          {!isOba && (
            <div className="mt-3 space-y-2">
              <ul className="space-y-1 text-xs text-gray-700">
                <Requirement met={verified} label={t('rungs.oba.reqVerified')} />
                <Requirement
                  met={(daysConnected ?? 0) >= 30}
                  label={t('rungs.oba.reqAge', { days: Math.max(0, 30 - (daysConnected ?? 0)) })}
                />
                <Requirement
                  met={(org.wa_name_status ?? '').toUpperCase() === 'APPROVED'}
                  label={t('rungs.oba.reqName')}
                />
              </ul>
              <p className="text-[11px] text-muted-foreground">{t('rungs.oba.notability')}</p>
              {obaEligible && (
                <a
                  href={phoneNumbersUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  {t('rungs.oba.request')}
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </Rung>
      </ol>
    </section>
  )
}

function Rung({
  done,
  pending = false,
  label,
  detail,
  children,
}: {
  done: boolean
  pending?: boolean
  label: string
  detail: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <div className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle size={18} className="text-green-600" />
        ) : (
          <Circle size={18} className={pending ? 'text-amber-500' : 'text-gray-300'} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {children}
      </div>
    </li>
  )
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {met ? (
        <CheckCircle size={14} className="text-green-600 shrink-0" />
      ) : (
        <Circle size={14} className="text-gray-300 shrink-0" />
      )}
      <span className={met ? 'text-gray-500' : ''}>{label}</span>
    </li>
  )
}
