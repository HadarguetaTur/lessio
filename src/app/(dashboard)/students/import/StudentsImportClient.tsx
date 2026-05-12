'use client'

import { useState } from 'react'
import { GraduationCap, Users, UsersRound } from 'lucide-react'
import { ImportFlow } from '@/components/import/ImportFlow'

type Tab = 'family-list' | 'students' | 'parents'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'family-list', label: 'תלמידים + הורים', icon: <UsersRound size={15} /> },
  { id: 'students', label: 'תלמידים בלבד', icon: <GraduationCap size={15} /> },
  { id: 'parents', label: 'הורים בלבד', icon: <Users size={15} /> },
]

export function StudentsImportClient() {
  const [tab, setTab] = useState<Tab>('family-list')

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-border/70">
        {TABS.map(({ id, label, icon }) => (
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
            {label}
          </button>
        ))}
      </div>

      <ImportFlow key={tab} entityType={tab} />
    </div>
  )
}
