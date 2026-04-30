'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, ClipboardList } from 'lucide-react'
import type { StudentExam } from '@/lib/students/exams'
import type { ExamActionState } from '@/app/(dashboard)/students/[id]/actions'
import { ExamFormSheet } from '@/components/students/ExamFormSheet'
import { Button } from '@/components/ui/button'

type Props = {
  studentId: string
  exams: StudentExam[]
  createAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  updateAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  deleteAction: (prev: ExamActionState, fd: FormData) => Promise<ExamActionState>
  canEdit: boolean
}

export function ExamList({
  studentId,
  exams,
  createAction,
  updateAction,
  deleteAction,
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
        <p className="text-sm text-gray-400">{t('empty')}</p>
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
                  <td className="px-3 py-2">{ex.title}</td>
                  <td className="px-3 py-2">{ex.subject}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {ex.score}/{ex.maxScore}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(ex)}
                          className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
                          aria-label={t('edit')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ex.id)}
                          disabled={pending}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 disabled:opacity-50"
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
