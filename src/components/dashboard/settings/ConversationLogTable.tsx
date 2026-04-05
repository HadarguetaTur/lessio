'use client'

/**
 * Conversation log table for the AI assistant settings page.
 * Shows last 50 conversation turns with masked phone numbers.
 * Each row has an "הצג הכל" expand toggle for long messages.
 * Per /docs/sprint-19-scope.md § Story 3.
 */

import { useState } from 'react'

interface LogRow {
  id: string
  phone: string
  role: string
  content: string
  created_at: string
}

interface Props {
  rows: LogRow[]
}

function maskPhone(phone: string): string {
  // E.164 format: +972501234567 → +9725****567
  if (phone.length < 7) return phone
  const prefix = phone.slice(0, 5)
  const suffix = phone.slice(-3)
  return `${prefix}****${suffix}`
}

function fmtDateTime(ts: string) {
  return new Date(ts).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TRUNCATE_AT = 100

function LogRow({ row }: { row: LogRow }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = row.content.length > TRUNCATE_AT
  const displayText = expanded || !isLong ? row.content : row.content.slice(0, TRUNCATE_AT) + '…'

  return (
    <tr className="hover:bg-gray-50 transition-colors align-top">
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
        {fmtDateTime(row.created_at)}
      </td>
      <td className="px-4 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">
        {maskPhone(row.phone)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            row.role === 'assistant'
              ? 'bg-blue-50 text-blue-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {row.role === 'assistant' ? 'עוזר AI' : 'הורה'}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-700 text-sm max-w-xs">
        <span>{displayText}</span>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mr-1 text-xs text-blue-600 hover:underline"
          >
            {expanded ? 'הסתר' : 'הצג הכל'}
          </button>
        )}
      </td>
    </tr>
  )
}

export function ConversationLogTable({ rows }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">אין שיחות עדיין.</p>
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
              זמן
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
              טלפון
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
              תפקיד
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
              הודעה
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <LogRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
