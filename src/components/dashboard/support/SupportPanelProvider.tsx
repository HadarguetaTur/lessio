'use client'

/**
 * Owns the support conversation panel and the one piece of state two very
 * different launchers share — Sprint 32.
 *
 * On desktop the launcher is a floating pill; on mobile it is a row inside the
 * quick-actions sheet, because two floating pills fighting over the bottom of a
 * phone screen is one too many. Both need to open the same panel, so the open
 * state lives here rather than in either of them.
 *
 * `useSupportPanel()` returns null when there is no provider above it. That is
 * deliberate, not defensive: the support-mode shell mounts the quick-actions
 * sheet without this provider, and a superadmin impersonating an org has no
 * business filing support tickets as that customer.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  SupportPanel,
  type SupportPanelActions,
  type WidgetConversation,
} from './SupportPanel'

interface SupportPanelContextValue {
  open: () => void
}

const SupportPanelContext = createContext<SupportPanelContextValue | null>(null)

export function useSupportPanel(): SupportPanelContextValue | null {
  return useContext(SupportPanelContext)
}

export function SupportPanelProvider({
  locale,
  firstName,
  actions,
  children,
}: {
  locale: string
  firstName: string
  actions: SupportPanelActions
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  // Bumped on every open so the panel remounts: a fresh conversation draft, and
  // no returning user dropped back into the thread they read yesterday.
  const [session, setSession] = useState(0)
  const [conversations, setConversations] = useState<WidgetConversation[] | null>(null)

  const refresh = useCallback(async () => {
    setConversations(await actions.fetchConversations())
  }, [actions])

  /**
   * Opens immediately and loads in parallel — the panel renders a skeleton
   * rather than making the launcher feel unresponsive while a request runs.
   *
   * The load is kicked off here, in the event handler that caused it, instead
   * of from an effect inside the panel: fetching in an effect makes the render
   * that follows a cascade, which is what the React compiler warns about.
   */
  const open = useCallback(() => {
    setSession((n) => n + 1)
    setConversations(null)
    setIsOpen(true)
    void refresh()
  }, [refresh])

  const value = useMemo(() => ({ open }), [open])

  return (
    <SupportPanelContext.Provider value={value}>
      {children}
      <SupportPanel
        key={session}
        open={isOpen}
        onOpenChange={setIsOpen}
        locale={locale}
        firstName={firstName}
        actions={actions}
        conversations={conversations}
        onRefresh={refresh}
      />
    </SupportPanelContext.Provider>
  )
}
