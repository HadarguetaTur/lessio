import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Building2, Globe, Mail, MessageCircle, Phone } from 'lucide-react'

import { ProspectStatusBadge } from '@/components/admin/ProspectStatusBadge'
import { normalizePhone } from '@/lib/phone'
import type { LeadCardData } from '@/lib/outbound/leadCard'

/** The person, and every way to reach them, in one glance. */
export async function LeadCardHeader({ data }: { data: LeadCardData }) {
  const t = await getTranslations('admin.leads')
  const tOut = await getTranslations('admin.outbound')
  const { lead, prospect, campaign, mailbox } = data

  const name =
    lead?.name ??
    [prospect?.first_name, prospect?.last_name].filter(Boolean).join(' ') ??
    null
  const company = lead?.company ?? prospect?.company ?? null
  const email = lead?.email ?? prospect?.email ?? null
  const phone = lead?.phone ?? prospect?.phone ?? null
  const website = prospect?.source_url && /^https?:\/\//.test(prospect.source_url) ? prospect.source_url : null

  let e164: string | null = null
  if (phone) {
    try {
      e164 = normalizePhone(phone)
    } catch {
      e164 = null
    }
  }

  return (
    <div className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{name || email || '—'}</h2>
          {company && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 size={14} />
              {company}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lead && <ProspectStatusBadge status={lead.status} label={t(`status.${lead.status}`)} />}
          {prospect && (
            <ProspectStatusBadge status={prospect.status} label={tOut(`status.${prospect.status}`)} />
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        {email && (
          <div className="flex items-center gap-2">
            <Mail size={14} className="shrink-0 text-muted-foreground" />
            <a href={`mailto:${email}`} className="truncate font-mono text-xs underline-offset-2 hover:underline" dir="ltr">
              {email}
            </a>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-2">
            <Phone size={14} className="shrink-0 text-muted-foreground" />
            <a href={`tel:${e164 ?? phone}`} className="font-mono text-xs underline-offset-2 hover:underline" dir="ltr">
              {phone}
            </a>
            {e164 && (
              <a
                href={`https://wa.me/${e164.replace(/^\+/, '')}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                <MessageCircle size={12} />
                {t('card.whatsapp')}
              </a>
            )}
          </div>
        )}
        {website && (
          <div className="flex items-center gap-2">
            <Globe size={14} className="shrink-0 text-muted-foreground" />
            <a
              href={website}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate text-xs underline-offset-2 hover:underline"
              dir="ltr"
            >
              {website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </div>
        )}
        {campaign && (
          <div className="text-xs text-muted-foreground">
            {t('card.campaign')}: {campaign.name}
          </div>
        )}
        {mailbox && (
          <div className="text-xs text-muted-foreground">
            {t('card.mailbox')}: <span dir="ltr" className="font-mono">{mailbox.email}</span>
          </div>
        )}
        {lead?.organization_id && (
          <div className="text-xs">
            <Link href={`/admin/orgs/${lead.organization_id}`} className="underline underline-offset-2">
              {t('card.organization')}
            </Link>
          </div>
        )}
      </dl>
    </div>
  )
}
