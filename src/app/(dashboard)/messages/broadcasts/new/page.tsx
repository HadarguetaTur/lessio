import { forbidden } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getGroups } from '@/lib/groups'
import { getTeachers } from '@/lib/teachers'
import { getBroadcastLists } from '@/lib/broadcast-lists'
import { metaTemplateBody } from '@/lib/whatsapp/registerTemplates'
import { BROADCAST_TEMPLATES, PARAM_LIMITS } from '@/lib/whatsapp/approvedTemplates'
import { tierDailyLimit } from '@/lib/whatsapp/health'
import { countConversationsLast24h } from '@/lib/whatsapp/broadcast/send'
import { getWaCapabilities, toLockedInfo } from '@/lib/whatsapp/capabilities'
import type { BroadcastType } from '@/lib/whatsapp/broadcast/types'
import { SectionHeader } from '@/components/inbox/SectionHeader'
import { LockedFeatureNotice } from '@/components/whatsapp/LockedFeature'
import {
  BroadcastComposer,
  type AudienceOption,
} from '@/components/dashboard/broadcasts/BroadcastComposer'
import { createBroadcastAction, previewAudienceAction } from '../actions'

/**
 * Compose a broadcast.
 *
 * The audience arrives ready-made when this was opened from a student group or
 * a lesson (`?audience=student_group:<id>`), which is the path most owners take.
 *
 * The composer is handed the verdict for each category rather than raw health
 * flags: what would block an update blocks the whole screen and is said up
 * front, what blocks only promos locks that one choice, and a limit shows its
 * cap and date. The server guard still runs on submit as the backstop.
 */
export default async function NewBroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string }>
}) {
  const t = await getTranslations('broadcasts')
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') forbidden()
  const canFix = session.role === 'owner'

  const params = await searchParams
  const db = createServiceRoleClient()

  const [{ data: orgData }, groups, teachers, lists, locale, used] = await Promise.all([
    db
      .from('organizations')
      .select('wa_quality_rating, wa_messaging_limit_tier, wa_business_verification_status')
      .eq('id', session.orgId)
      .maybeSingle(),
    getGroups(session.orgId),
    getTeachers(session.orgId),
    getBroadcastLists(session.orgId),
    getLocale(),
    countConversationsLast24h(db, session.orgId, new Date()),
  ])

  const capabilities = await getWaCapabilities(session.orgId, session, { conversationsLast24h: used })
  const update = toLockedInfo(capabilities.byKey.service_updates, capabilities.timezone, locale)
  const promo = toLockedInfo(capabilities.byKey.promo_broadcasts, capabilities.timezone, locale)

  if (update.status === 'locked') {
    return (
      <div className="space-y-6">
        <SectionHeader title={t('newTitle')} subtitle={t('newSubtitle')} />
        <LockedFeatureNotice info={update} canFix={canFix} />
      </div>
    )
  }

  const org = orgData as {
    wa_quality_rating: string | null
    wa_messaging_limit_tier: string | null
    wa_business_verification_status: string | null
  } | null

  const tier = tierDailyLimit(org?.wa_messaging_limit_tier)
  const dailyRemaining =
    tier === null ? null : tier === Number.POSITIVE_INFINITY ? null : Math.max(0, tier - used)

  const audiences: AudienceOption[] = [
    { value: 'all_active', label: t('audiences.allActive'), filter: { kind: 'all_active' } },
    { value: 'open_debt', label: t('audiences.openDebt'), filter: { kind: 'open_debt' } },
    ...groups.map((g) => ({
      value: `student_group:${g.id}`,
      label: t('audiences.group', { name: g.name, count: g.studentCount }),
      filter: { kind: 'student_group' as const, groupId: g.id },
    })),
    // Saved lists come right after the groups: they are the other thing an
    // owner means by "a list", and the lists page links here with one selected.
    ...lists.map((list) => ({
      value: `list:${list.id}`,
      label: t('audiences.list', { name: list.name, count: list.memberCount }),
      filter: { kind: 'list' as const, listId: list.id },
    })),
    ...teachers.filter((teacher) => teacher.is_active).map((teacher) => ({
      value: `teacher:${teacher.id}`,
      label: t('audiences.teacher', { name: teacher.profile.full_name }),
      filter: { kind: 'teacher' as const, teacherId: teacher.id },
    })),
  ]

  const initialAudience = audiences.some((a) => a.value === params.audience)
    ? params.audience
    : undefined

  return (
    <div className="space-y-6">
      <SectionHeader title={t('newTitle')} subtitle={t('newSubtitle')} />
      <BroadcastComposer
        audiences={audiences}
        initialAudience={initialAudience}
        health={{
          qualityRating: org?.wa_quality_rating ?? 'UNKNOWN',
          dailyRemaining,
          verified: (org?.wa_business_verification_status ?? '').toLowerCase() === 'verified',
        }}
        capabilities={{ update, promo }}
        canFix={canFix}
        previews={buildPreviews()}
        messageMax={PARAM_LIMITS.broadcast_message}
        topicMax={PARAM_LIMITS.broadcast_topic}
        createAction={createBroadcastAction}
        previewAudienceAction={previewAudienceAction}
      />
    </div>
  )
}

/**
 * The preview reads the copy Meta actually approved, rather than a second
 * version written for the screen — two copies would drift, and the one a parent
 * receives is this one.
 */
function buildPreviews() {
  const types: BroadcastType[] = ['class_update', 'promo', 'group_invite']
  const out = {} as Record<BroadcastType, Record<'he' | 'en', { body: string; button: string | null }>>

  for (const type of types) {
    out[type] = { he: { body: '', button: null }, en: { body: '', button: null } }
    for (const locale of ['he', 'en'] as const) {
      const spec = BROADCAST_TEMPLATES[type]?.[locale]
      const registered = spec ? metaTemplateBody(spec.name) : null
      out[type][locale] = {
        body: registered?.text ?? '',
        button: registered?.buttons[0]?.label ?? null,
      }
    }
  }
  return out
}
