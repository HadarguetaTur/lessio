'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp, GraduationCap, Users, UsersRound } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'

type Tab = 'family-list' | 'students' | 'parents'

export function StudentsImportClient() {
  const t = useTranslations('students.importTabs')
  const [tab, setTab] = useState<Tab>('family-list')
  const [advanced, setAdvanced] = useState(false)

  const tabButton = (id: Tab, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => setTab(id)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === id ? 'border-teal-600 text-teal-700 dark:text-teal-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
      {icon}{label}
    </button>
  )

  return (
    <div>
      <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
        <div className="flex items-start gap-3">
          <UsersRound className="mt-0.5 size-5 shrink-0 text-violet-700" />
          <div><p className="font-semibold text-foreground">{t('recommendedTitle')}</p><p className="mt-1 text-sm text-muted-foreground">{t('recommendedDescription')}</p></div>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border/70">
        {tabButton('family-list', t('familyList'), <UsersRound size={15} />)}
        {advanced && tabButton('students', t('students'), <GraduationCap size={15} />)}
        {advanced && tabButton('parents', t('parents'), <Users size={15} />)}
      </div>

      <button type="button" onClick={() => { setAdvanced((value) => !value); setTab('family-list') }} className="mb-5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        {advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{t('advancedToggle')}
      </button>

      <ImportFlow key={tab} entityType={tab} />
    </div>
  )
}
