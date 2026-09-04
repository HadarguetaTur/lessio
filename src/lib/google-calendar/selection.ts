/**
 * Shared server-side logic for saving a calendar selection (org and teacher
 * actions both use it). The client sends ids only; summaries are resolved
 * against a fresh calendarList so a forged summary can never be stored. An id
 * missing from the fresh list is accepted only if it was already part of the
 * stored selection (a calendar that disappeared on Google's side).
 */

import { listCalendars, resolveSelectedCalendars, SelectedCalendar } from './index'

export type SelectionUpdateResult =
  | { ok: true; selection: SelectedCalendar[] }
  | { ok: false; reason: 'list_failed' | 'unknown_id' }

export async function resolveSelectionUpdate(params: {
  encryptedToken: string
  currentRaw:     unknown
  requestedIds:   string[]
}): Promise<SelectionUpdateResult> {
  const { encryptedToken, currentRaw, requestedIds } = params

  let listed
  try {
    listed = await listCalendars(encryptedToken)
  } catch (err) {
    console.error('[google-calendar] calendarList fetch failed while saving selection', { err })
    return { ok: false, reason: 'list_failed' }
  }

  const listedById  = new Map(listed.map(e => [e.id, e]))
  const currentById = new Map(resolveSelectedCalendars(currentRaw).map(c => [c.id, c]))

  const selection: SelectedCalendar[] = []
  for (const id of requestedIds) {
    const entry = listedById.get(id)
    if (entry) {
      selection.push({ id, summary: id === 'primary' ? null : entry.summary })
      continue
    }
    const kept = currentById.get(id)
    if (kept) {
      selection.push(kept)
      continue
    }
    return { ok: false, reason: 'unknown_id' }
  }

  return { ok: true, selection }
}
