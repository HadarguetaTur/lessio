import Link from 'next/link'
import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Megaphone, Users, Wallet, GraduationCap, Link2, ListChecks } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { getGroups } from '@/lib/groups'
import { getTeachers } from '@/lib/teachers'
import { getBroadcastLists, getListableParents } from '@/lib/broadcast-lists'
import { SectionHeader } from '@/components/inbox/SectionHeader'
import { ManualListSheet } from '@/components/inbox/ManualListSheet'
import { createListAction, deleteListAction, updateListAction } from './actions'

/**
 * Who you can write to at once.
 *
 * "Lists" here means two things an owner already has in mind. Her student
 * groups are lists — she made them, they have names, and "tell the Tuesday
 * group" is the most common announcement there is. And a saved list is for the
 * choice that follows no structure: the five parents who asked about the
 * summer course. Plus three audiences every studio has without making anything:
 * everyone, everyone who owes money, and a teacher's families.
 *
 * Every card does one thing — "send an update" — and hands the composer the
 * audience already selected. Groups themselves are still created and edited in
 * Students; this page links there rather than keeping a second editor for the
 * same thing.
 */
export default async function ListsPage() {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') forbidden()
  await requireFeature(session.orgId, 'broadcasts')

  const t = await getTranslations('inbox.lists')

  const [groups, teachers, lists, parents] = await Promise.all([
    getGroups(session.orgId, { status: 'active' }),
    getTeachers(session.orgId),
    getBroadcastLists(session.orgId),
    getListableParents(session.orgId),
  ])

  const activeTeachers = teachers.filter((teacher) => teacher.is_active)

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<ManualListSheet parents={parents} saveAction={createListAction} />}
      />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">{t('savedTitle')}</h3>
        {lists.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t('savedEmpty')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lists.map((list) => (
              <ListCard
                key={list.id}
                icon={ListChecks}
                title={list.name}
                detail={t('parentsCount', { count: list.memberCount })}
                sendHref={`/messages/broadcasts/new?audience=list:${list.id}`}
                sendLabel={t('sendUpdate')}
                disabled={list.memberCount === 0}
                extra={
                  <ManualListSheet
                    parents={parents}
                    list={list}
                    saveAction={updateListAction.bind(null, list.id)}
                    deleteAction={deleteListAction.bind(null, list.id)}
                  />
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('groupsTitle')}</h3>
          <Link
            href="/students?tab=groups"
            className="text-xs font-medium text-primary underline underline-offset-4"
          >
            {t('manageGroups')}
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t('groupsEmpty')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <ListCard
                key={group.id}
                icon={Users}
                title={group.name}
                detail={t('studentsCount', { count: group.studentCount })}
                badge={group.waGroupMode !== 'none' ? t('linkedGroup') : undefined}
                sendHref={`/messages/broadcasts/new?audience=student_group:${group.id}`}
                sendLabel={t('sendUpdate')}
                disabled={group.studentCount === 0}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">{t('builtInTitle')}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ListCard
            icon={Users}
            title={t('allActive')}
            detail={t('allActiveHint')}
            sendHref="/messages/broadcasts/new?audience=all_active"
            sendLabel={t('sendUpdate')}
          />
          <ListCard
            icon={Wallet}
            title={t('openDebt')}
            detail={t('openDebtHint')}
            sendHref="/messages/broadcasts/new?audience=open_debt"
            sendLabel={t('sendUpdate')}
          />
          {activeTeachers.map((teacher) => (
            <ListCard
              key={teacher.id}
              icon={GraduationCap}
              title={t('byTeacher', { name: teacher.profile.full_name })}
              detail={t('byTeacherHint')}
              sendHref={`/messages/broadcasts/new?audience=teacher:${teacher.id}`}
              sendLabel={t('sendUpdate')}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * One audience. Same shape whatever kind it is, so the page reads as one list
 * of places to write to rather than three different features.
 */
function ListCard({
  icon: Icon,
  title,
  detail,
  badge,
  sendHref,
  sendLabel,
  disabled = false,
  extra,
}: {
  icon: typeof Users
  title: string
  detail: string
  badge?: string
  sendHref: string
  sendLabel: string
  disabled?: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
          {badge && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
              <Link2 size={11} aria-hidden />
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {disabled ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Megaphone size={14} aria-hidden />
            {sendLabel}
          </span>
        ) : (
          <Link
            href={sendHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Megaphone size={14} aria-hidden />
            {sendLabel}
          </Link>
        )}
        {extra}
      </div>
    </div>
  )
}
