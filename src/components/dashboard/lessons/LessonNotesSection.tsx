'use client'

/**
 * Lesson notes section — add / view / delete notes on a lesson.
 * Per /docs/sprint-24-scope.md § Story 2.
 *
 * Receives notes as server-rendered props + server actions as props (per Server Action prop rule).
 */

import { useActionState } from 'react'
import { Trash2 } from 'lucide-react'
import type { LessonNote } from '@/lib/lessons/notes'
import type { AddNoteResult, DeleteNoteResult } from '@/app/(dashboard)/lessons/[id]/actions'

type Props = {
  notes: LessonNote[]
  lessonId: string
  addNoteAction: (prev: AddNoteResult, formData: FormData) => Promise<AddNoteResult>
  deleteNoteAction: (prev: DeleteNoteResult, formData: FormData) => Promise<DeleteNoteResult>
  canAdd: boolean
}

export function LessonNotesSection({
  notes,
  addNoteAction,
  deleteNoteAction,
  canAdd,
}: Props) {
  const [addState, addAction, addPending] = useActionState(addNoteAction, { error: null })
  const [deleteState, deleteAction] = useActionState(deleteNoteAction, { error: null })

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">הערות שיעור</h2>

      {notes.length === 0 && (
        <p className="text-sm text-gray-400">אין הערות לשיעור זה.</p>
      )}

      {notes.length > 0 && (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="bg-gray-50 rounded-lg p-3 text-sm group">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <p className="text-gray-700 whitespace-pre-wrap">{note.body}</p>
                  <p className="text-xs text-gray-400">
                    {note.teacherName} · {new Date(note.createdAt).toLocaleDateString('he-IL')}
                  </p>
                </div>
                <form action={deleteAction}>
                  <input type="hidden" name="noteId" value={note.id} />
                  <button
                    type="submit"
                    title="מחק הערה"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteState.error && (
        <p className="text-xs text-red-600">{deleteState.error}</p>
      )}

      {canAdd && (
        <form action={addAction} className="space-y-2">
          <textarea
            name="body"
            rows={3}
            required
            placeholder="הוסף הערה על השיעור..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {addState.error && (
            <p className="text-xs text-red-600">{addState.error}</p>
          )}
          {addState.success && (
            <p className="text-xs text-green-600">ההערה נשמרה.</p>
          )}
          <button
            type="submit"
            disabled={addPending}
            className="text-sm px-4 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {addPending ? 'שומר...' : 'הוסף הערה'}
          </button>
        </form>
      )}
    </div>
  )
}
