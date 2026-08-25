'use client'

/**
 * AssignForm — client component for assigning homework to students.
 * Per /docs/sprint-14-scope.md § Story 4.
 */

import { useActionState, useState, useRef } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Paperclip, X, Clock } from 'lucide-react'
import type { AssignActionState } from '@/app/(dashboard)/homework/assign/actions'

interface Template {
  id: string
  title: string
  body: string
  subject: string | null
}

interface Student {
  id: string
  full_name: string
}

interface AssignFormProps {
  templates: Template[]
  students: Student[]
  action: (prev: AssignActionState, fd: FormData) => Promise<AssignActionState>
}

const initialState: AssignActionState = { error: null }

export function AssignForm({ templates, students, action }: AssignFormProps) {
  const t = useTranslations('homework')
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [mode, setMode] = useState<'template' | 'adhoc'>('template')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [files, setFiles] = useState<File[]>([])
  const [isScheduled, setIsScheduled] = useState(false)
  const [sendAt, setSendAt] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? [])
    setFiles((prev) => [...prev, ...newFiles])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <p className="text-green-800 font-medium text-sm">
          ✅ {t('assignedCount', { count: state.count ?? 0 })}
        </p>
        <Link
          href="/homework"
          className="mt-3 inline-block text-sm text-blue-600 hover:underline"
        >
          {t('backToHomework')}
        </Link>
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        // Inject files into FormData
        for (const f of files) fd.append('files', f)
        // Inject sendAt as ISO string
        if (isScheduled && sendAt) {
          fd.set('sendAt', new Date(sendAt).toISOString())
        }
        formAction(fd)
      }}
      className="space-y-6"
    >
      {/* Mode toggle */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">{t('type')}</p>
        <div className="flex rounded-md border border-gray-300 overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setMode('template')}
            className={`px-4 py-1.5 text-sm transition-colors ${
              mode === 'template'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('fromTemplate')}
          </button>
          <button
            type="button"
            onClick={() => setMode('adhoc')}
            className={`px-4 py-1.5 text-sm transition-colors ${
              mode === 'adhoc'
                ? 'bg-blue-600 text-white font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('adhoc')}
          </button>
        </div>
      </div>

      {/* Template mode */}
      {mode === 'template' && (
        <div className="space-y-3">
          <div>
            <label htmlFor="templateId" className="block text-sm font-medium text-gray-700 mb-1">
              {t('fields.template')} <span className="text-red-600">*</span>
            </label>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('noTemplatesList')}{' '}
                <Link href="/homework/templates/new" className="text-blue-600 hover:underline">
                  {t('createFirstTemplate')}
                </Link>
              </p>
            ) : (
              <select
                id="templateId"
                name="templateId"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('selectTemplate')}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.subject ? ` (${t.subject})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedTemplate && (
            <div className="bg-gray-50 rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">{t('templateContent')}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTemplate.body}</p>
            </div>
          )}
        </div>
      )}

      {/* Ad-hoc mode */}
      {mode === 'adhoc' && (
        <div className="space-y-4">
          {/* templateId is empty in adhoc mode */}
          <input type="hidden" name="templateId" value="" />

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              {t('fields.title')} <span className="text-red-600">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              maxLength={200}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('titlePlaceholder')}
            />
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
              {t('fields.body')} <span className="text-red-600">*</span>
            </label>
            <textarea
              id="body"
              name="body"
              rows={5}
              maxLength={2000}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
              placeholder={t('bodyPlaceholder')}
            />
          </div>
        </div>
      )}

      {/* Students multi-select */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          {t('fields.students')} <span className="text-red-600">*</span>
        </p>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noStudents')}</p>
        ) : (
          <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {students.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  name="studentIds"
                  value={s.id}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-900">{s.full_name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Due date */}
      <div>
        <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
          {t('fields.dueDate')}{' '}
          <span className="text-muted-foreground text-xs">{t('dueDateOptional')}</span>
        </label>
        <input
          id="dueDate"
          name="dueDate"
          type="date"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* File attachments */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          {t('attachFiles')}{' '}
          <span className="text-muted-foreground text-xs">{t('dueDateOptional')}</span>
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Paperclip size={14} />
            {t('addFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded px-2 py-1">
                  <Paperclip size={12} className="text-muted-foreground shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">({Math.round(f.size / 1024)} KB)</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ms-auto text-muted-foreground hover:text-red-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Scheduled send */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isScheduled}
            onChange={(e) => {
              setIsScheduled(e.target.checked)
              if (!e.target.checked) setSendAt('')
            }}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Clock size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium text-gray-700">{t('scheduleSend')}</span>
        </label>
        {isScheduled && (
          <div className="mt-2 ms-6">
            <input
              type="datetime-local"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              required={isScheduled}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('scheduleSendHint')}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {state.error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending || (mode === 'template' && !selectedTemplateId) || (isScheduled && !sendAt)}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? t('assignSending') : isScheduled ? t('assignAndSchedule') : t('assignAndSend')}
      </button>
    </form>
  )
}
