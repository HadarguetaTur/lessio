'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import type { ReportExamState } from '@/app/portal/[orgId]/exams/actions'

type Props = {
  action: (prev: ReportExamState, fd: FormData) => Promise<ReportExamState>
  students: { id: string; name: string }[]
}

export function PortalExamReportForm({ action, students }: Props) {
  const t = useTranslations('portal.exams.form')
  const [state, formAction, isPending] = useActionState(action, { error: null })

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-sm text-green-700 font-semibold">{t('success')}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">{t('title')}</p>

      {students.length > 1 ? (
        <select
          name="studentId"
          required
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="studentId" value={students[0]?.id ?? ''} />
      )}

      <input
        name="subject"
        required
        maxLength={100}
        placeholder={t('subjectPlaceholder')}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <input
        name="title"
        required
        maxLength={200}
        placeholder={t('titlePlaceholder')}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <textarea
        name="description"
        rows={3}
        maxLength={2000}
        placeholder={t('descriptionPlaceholder')}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <div>
        <label className="text-xs text-muted-foreground">{t('examDate')}</label>
        <input
          name="examDate"
          type="date"
          required
          className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer border border-dashed border-border rounded-lg p-3 hover:bg-accent/30 transition-colors">
        <Upload size={16} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('upload', { maxMb: 10 })}</span>
        <input type="file" name="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
      </label>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={isPending || students.length === 0}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
