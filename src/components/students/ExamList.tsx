'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, ClipboardList, Paperclip } from 'lucide-react'
import type { StudentExam } from '@/lib/students/exams'
import type { ExamActionState } from '@/app/(dashboard)/students/[id]/actions'
import { ExamFormSheet } from '@/components/students/ExamFormSheet'
import { Button } from '@/components/ui/button'

export type ExamWithFileUrl = StudentExam & { fileUrl?: string | null; bumpApproved?: boolean }

type Props = {
  studentId: string
  exams: ExamWithFileUrl[]
  createAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  updateAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  deleteAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  /** Set when exam_policy_mode = 'approve': one-click quota-bump approval. */
  approveBumpAction?: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  canEdit: boolean
}

export function ExamList({
  studentId,
  exams,
  createAction,
  updateAction,
  deleteAction,
  approveBumpAction,
  canEdit,
}: Props) {
  const t = useTranslations('studentProfile.exams')
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<StudentExam | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = () => router.refresh()

  const openCreate = () => {
    setEditing(null)
    setSheetOpen(true)
  }

  const openEdit = (exam: StudentExam) => {
    setEditing(exam)
    setSheetOpen(true)
  }

  const handleDelete = (examId: string) => {
    const fd = new FormData()
    fd.set('examId', examId)
    fd.set('studentId', studentId)
    startTransition(async () => {
      setError(null)
      const result = await deleteAction({ error: null }, fd)
      if (result.error) setError(result.error)
      else refresh()
    })
  }

  const handleApproveBump = (examId: string) => {
    if (!approveBumpAction) return
    const fd = new FormData()
    fd.set('examId', examId)
    fd.set('studentId', studentId)
    startTransition(async () => {
      setError(null)
      const result = await approveBumpAction({ error: null }, fd)
      if (result.error) setError(result.error)
      else refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <ClipboardList size={14} />
          {t('title')}
        </h2>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={openCreate} className="gap-1">
            <Plus size={14} />
            {t('add')}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {exams.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-600">{t('columns.date')}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{t('columns.title')}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{t('columns.subject')}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{t('columns.score')}</th>
                {canEdit && <th className="px-3 py-2 w-24" />}
              </tr>
            </thead>
            <tbody>
              {exams.map((ex) => (
                <tr key={ex.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{ex.examDate}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{ex.title}</span>
                      {ex.status === 'reported' && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
                          {ex.source === 'student' ? t('reportedByStudent') : t('reportedByParent')}
                        </span>
                      )}
                      {ex.fileUrl && (
                        <a
                          href={ex.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline text-xs"
                        >
                          <Paperclip size={12} />
                          {t('attachment')}
                        </a>
                      )}
                    </div>
                    {ex.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                        {ex.description}
                      </p>
                    )}
                    {ex.status === 'reported' && canEdit && approveBumpAction && (
                      <div className="mt-1.5">
                        {ex.bumpApproved ? (
                          <span className="text-xs text-green-700">{t('bumpApproved')}</span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => handleApproveBump(ex.id)}
                          >
                            {t('approveBump')}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{ex.subject}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {ex.score != null ? `${ex.score}/${ex.maxScore}` : '—'}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(ex)}
                          className="p-1.5 rounded text-muted-foreground hover:bg-gray-100"
                          aria-label={t('edit')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ex.id)}
                          disabled={pending}
                          className="p-1.5 rounded text-red-700 hover:bg-red-50 disabled:opacity-50"
                          aria-label={t('delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ExamFormSheet
        studentId={studentId}
        exam={editing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        createAction={createAction}
        updateAction={updateAction}
        canEdit={canEdit}
        onSuccess={refresh}
      />
    </div>
  )
}
