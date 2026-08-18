'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { GraduationCap, Users, UsersRound } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'

type Tab = 'family-list' | 'students' | 'parents'

const TABS: { id: Tab; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'family-list', labelKey: 'familyList', icon: <UsersRound size={15} /> },
  { id: 'students', labelKey: 'students', icon: <GraduationCap size={15} /> },
  { id: 'parents', labelKey: 'parents', icon: <Users size={15} /> },
]

export function StudentsImportClient() {
  const t = useTranslations('students.importTabs')
  const [tab, setTab] = useState<Tab>('family-list')

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-border/70">
        {TABS.map(({ id, labelKey, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {icon}
            {t(labelKey)}
          </button>
        ))}
      </div>

      <ImportFlow key={tab} entityType={tab} />
    </div>
  )
}
