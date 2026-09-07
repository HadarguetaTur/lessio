/**
 * Cold-email rendering. Pure.
 *
 * The campaign body is plain text with `{{key}}` placeholders. Personalisation
 * arrives with the CSV (`personal_line`, `subject_area`, free `metadata.*`
 * columns), so an empty value must degrade gracefully: the placeholder
 * disappears and the punctuation/blank line it would have left is tidied.
 */

import { escapeHtml, wrapEmailHtml } from '@/lib/email/templates/base'
import type { Campaign, Prospect } from './types'

export type TemplateVars = Record<string, string | number | null | undefined | Record<string, unknown>>

function lookup(vars: TemplateVars, path: string): string {
  const [head, ...rest] = path.split('.')
  let value: unknown = vars[head!]
  for (const key of rest) {
    if (value && typeof value === 'object') value = (value as Record<string, unknown>)[key]
    else return ''
  }
  if (value == null) return ''
  return typeof value === 'string' ? value.trim() : String(value)
}

export function renderTemplate(text: string, vars: TemplateVars): string {
  const substituted = text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => lookup(vars, path))
  return (
    substituted
      // "Hi ," -> "Hi," ; "Hi , " -> "Hi, "
      .replace(/[ \t]+([,.!?;:])/g, '$1')
      // ", ," and ",," left by two adjacent empty values
      .replace(/([,;])\s*[,;]/g, '$1')
      // runs of spaces inside a line
      .replace(/[ \t]{2,}/g, ' ')
      // a line that held only a placeholder collapses; never more than one blank line
      .replace(/\n[ \t]+\n/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

export function prospectVars(prospect: Prospect): TemplateVars {
  return {
    first_name: prospect.first_name,
    last_name: prospect.last_name,
    company: prospect.company,
    email: prospect.email,
    personal_line: prospect.personal_line,
    subject_area: prospect.subject_area,
    source_url: prospect.source_url,
    metadata: prospect.metadata ?? {},
  }
}

export interface RenderedMessage {
  subject: string
  bodyText: string
  bodyHtml: string
}

/** Plain text -> minimal HTML: one <p> per paragraph, <br> inside, escaped. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => escapeHtml(para).replace(/\n/g, '<br>'))
    .map((para) => `<p style="margin:0 0 14px;color:#111827;font-size:15px;line-height:1.6;">${para}</p>`)
    .join('')
}

export function renderCampaignMessage(campaign: Campaign, prospect: Prospect): RenderedMessage {
  const vars = prospectVars(prospect)
  const subject = renderTemplate(campaign.subject, vars).replace(/\s*\n+\s*/g, ' ')
  const bodyText = renderTemplate(campaign.body_text, vars)
  const bodyHtml = wrapEmailHtml(textToHtml(bodyText), prospect.locale ?? campaign.locale)
  return { subject, bodyText, bodyHtml }
}
