'use client'

/**
 * The support conversation panel — Sprint 32.
 *
 * This replaces a subject/description form. The change is not cosmetic: a form
 * asks someone to title their problem before describing it, which is a filing
 * habit, not how anyone actually asks for help. Here they pick what it is about
 * and then just talk, and the queue's one-line label is derived from what they
 * wrote (see lib/support/subject.ts).
 *
 * It is a floating panel rather than a full-height Sheet so it reads as a side
 * channel — the dashboard stays visible behind it, the way a chat widget should.
 * Radix Dialog underneath, for focus trapping and Escape, without its centered
 * positioning.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowRight, ArrowLeft, X, Plus, LifeBuoy, ArrowUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SupportTicketMessage, TicketStatus } from '@/lib/support/tickets'
import { SupportStatusBadge } from './SupportStatusBadge'

const CATEGORIES = ['bug', 'question', 'feature_request', 'other'] as const
type Category = (typeof CATEGORIES)[number]

export interface WidgetConversation {
  id: string
  subject: string
  status: TicketStatus
  lastMessage: string
  lastMessageAt: string
  awaitingCustomer: boolean
}

export interface SupportPanelActions {
  createTicket: (
    prev: { error: string | null; ticketId?: string } | null,
    formData: FormData
  ) => Promise<{ error: string | null; ticketId?: string }>
  reply: (
    prev: { error: string | null } | null,
    formData: FormData
  ) => Promise<{ error: string | null }>
  fetchConversations: () => Promise<WidgetConversation[]>
  fetchConversation: (
    ticketId: string
  ) => Promise<{ subject: string; status: TicketStatus; messages: SupportTicketMessage[] } | null>
}

type ThreadData = Awaited<ReturnType<SupportPanelActions['fetchConversation']>>

type View =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'thread'; ticketId: string; data: ThreadData }

export function SupportPanel({
  open,
  onOpenChange,
  locale,
  firstName,
  actions,
  conversations,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locale: string
  firstName: string
  actions: SupportPanelActions
  conversations: WidgetConversation[] | null
  onRefresh: () => Promise<void>
}) {
  const t = useTranslations('support.panel')
  // null means "wherever the conversations say to start" — derived below rather
  // than written by an effect once they load.
  const [view, setView] = useState<View | null>(null)

  // A first-time user goes straight to the composer: an empty list with a
  // button to press is a dead end when the whole point is to start talking.
  const current: View =
    view ?? (conversations && conversations.length === 0 ? { name: 'new' } : { name: 'list' })

  /** Navigating into a thread: show the skeleton, there is nothing to keep. */
  const openThread = async (ticketId: string) => {
    setView({ name: 'thread', ticketId, data: null })
    setView({ name: 'thread', ticketId, data: await actions.fetchConversation(ticketId) })
  }

  /**
   * Re-reading a thread already on screen. Deliberately does NOT blank the data
   * first: the reader is looking at their own message, and replacing it with a
   * skeleton for the length of a round-trip reads as the message being lost.
   */
  const refreshThread = async (ticketId: string) => {
    setView({ name: 'thread', ticketId, data: await actions.fetchConversation(ticketId) })
  }

  const isRtl = locale === 'he'
  const BackIcon = isRtl ? ArrowRight : ArrowLeft

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-foreground/10 supports-backdrop-filter:backdrop-blur-[2px]',
            'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0'
          )}
        />
        <DialogPrimitive.Content
          aria-label={t('title')}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-card text-card-foreground outline-none',
            'ring-1 ring-foreground/10 shadow-2xl',
            // Phone: a tall sheet off the bottom, clear of the home indicator.
            'inset-x-0 bottom-0 max-h-[88svh] rounded-t-3xl',
            // Desktop: a floating card tucked into the corner the launcher sits in.
            'sm:inset-x-auto sm:bottom-6 sm:end-6 sm:w-[390px] sm:rounded-3xl',
            'sm:max-h-[min(38rem,calc(100vh-6rem))]',
            'duration-200 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4',
            'data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4'
          )}
        >
          {/* Header — a warm band, so the panel does not read as another table. */}
          <header className="relative shrink-0 bg-primary px-4 pb-5 pt-4 text-primary-foreground">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-white/15 via-transparent to-transparent"
            />
            <div className="relative flex items-center gap-2">
              {current.name !== 'list' ? (
                <button
                  type="button"
                  onClick={() => setView({ name: 'list' })}
                  aria-label={t('back')}
                  className="-ms-1.5 rounded-full p-1.5 transition-colors hover:bg-white/15"
                >
                  <BackIcon className="size-4" />
                </button>
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-white/15">
                  <LifeBuoy className="size-4" aria-hidden />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate text-sm font-semibold">
                  {current.name === 'new' ? t('newTitle') : t('title')}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="truncate text-xs text-primary-foreground/75">
                  {t('subtitle')}
                </DialogPrimitive.Description>
              </div>

              <DialogPrimitive.Close
                aria-label={t('close')}
                className="-me-1.5 rounded-full p-1.5 transition-colors hover:bg-white/15"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </header>

          {current.name === 'list' ? (
            <ConversationList
              conversations={conversations}
              onOpen={openThread}
              onNew={() => setView({ name: 'new' })}
            />
          ) : current.name === 'new' ? (
            <NewConversation
              firstName={firstName}
              createTicket={actions.createTicket}
              onCreated={async (ticketId) => {
                await openThread(ticketId)
                await onRefresh()
              }}
            />
          ) : (
            <Thread
              ticketId={current.ticketId}
              data={current.data}
              reply={actions.reply}
              onReplied={async () => {
                await refreshThread(current.ticketId)
                await onRefresh()
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  onOpen,
  onNew,
}: {
  conversations: WidgetConversation[] | null
  onOpen: (ticketId: string) => void
  onNew: () => void
}) {
  const t = useTranslations('support.panel')
  const format = useFormatter()

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {conversations === null ? (
          <ListSkeleton />
        ) : conversations.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('emptyList')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onOpen(conversation.id)}
                  className="w-full rounded-2xl px-3 py-2.5 text-start transition-colors hover:bg-muted/70"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {conversation.subject}
                    </span>
                    {conversation.awaitingCustomer ? (
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        aria-label={t('replied')}
                      />
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {conversation.lastMessage}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/70">
                      {format.dateTime(new Date(conversation.lastMessageAt), {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden />
          {t('newConversation')}
        </button>
      </footer>
    </>
  )
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-3 py-2.5">
          <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-muted" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded-full bg-muted/70" />
        </li>
      ))}
    </ul>
  )
}

// ── New conversation ──────────────────────────────────────────────────────────

function NewConversation({
  firstName,
  createTicket,
  onCreated,
}: {
  firstName: string
  createTicket: SupportPanelActions['createTicket']
  onCreated: (ticketId: string) => Promise<void>
}) {
  const t = useTranslations('support.panel')
  const [category, setCategory] = useState<Category | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const send = (body: string) => {
    if (!category) return
    setError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.set('body', body)
      formData.set('category', category)
      formData.set('page_url', window.location.pathname)
      formData.set('user_agent', navigator.userAgent)

      const result = await createTicket(null, formData)
      if (result.error || !result.ticketId) {
        setError(result.error ?? t('sendFailed'))
        return
      }
      await onCreated(result.ticketId)
    })
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-4">
        <div className="flex flex-col gap-3">
          <Bubble side="start">
            {firstName ? t('greeting', { name: firstName }) : t('greetingNoName')}
          </Bubble>

          {category ? (
            <Bubble side="end">{t(`category.${category}`)}</Bubble>
          ) : (
            <div className="flex flex-wrap gap-1.5 ps-1">
              {CATEGORIES.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  style={{ animationDelay: `${index * 40}ms` }}
                  className={cn(
                    'rounded-full border border-primary/25 bg-card px-3 py-1.5 text-xs font-medium text-primary',
                    'transition-colors hover:bg-primary hover:text-primary-foreground',
                    'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards'
                  )}
                >
                  {t(`category.${option}`)}
                </button>
              ))}
            </div>
          )}

          {category ? <Bubble side="start">{t('describePrompt')}</Bubble> : null}
        </div>
      </div>

      <Composer
        disabled={!category}
        pending={pending}
        error={error}
        placeholder={category ? t('composerPlaceholder') : t('composerLocked')}
        minLength={10}
        tooShortHint={t('tooShort')}
        onSend={send}
      />
    </>
  )
}

// ── Thread ────────────────────────────────────────────────────────────────────

function Thread({
  ticketId,
  data,
  reply,
  onReplied,
}: {
  ticketId: string
  data: ThreadData
  reply: SupportPanelActions['reply']
  onReplied: () => Promise<void>
}) {
  const t = useTranslations('support.panel')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Pure DOM synchronisation, which is what an effect is actually for: keep the
  // newest message in view whenever the thread changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [data])

  const send = (body: string) => {
    setError(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('ticket_id', ticketId)
      formData.set('body', body)

      const result = await reply(null, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      await onReplied()
    })
  }

  const closed = data?.status === 'closed'

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-4">
        {data === null ? (
          <ListSkeleton />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex justify-center pb-1">
              <SupportStatusBadge status={data.status} />
            </div>

            {data.messages.map((message, index) => (
              <div key={message.id} className="flex flex-col gap-1">
                <Bubble
                  side={message.author_type === 'customer' ? 'end' : 'start'}
                  variant={
                    message.author_type === 'system'
                      ? 'system'
                      : message.author_type === 'ai'
                        ? 'ai'
                        : 'default'
                  }
                  delayMs={Math.min(index, 6) * 30}
                >
                  {message.body}
                </Bubble>
                {message.author_type !== 'customer' ? (
                  <span className="px-1 text-[11px] text-muted-foreground">
                    {t(`author.${message.author_type}`)}
                  </span>
                ) : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {closed ? (
        <p className="shrink-0 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
          {t('closedNotice')}
        </p>
      ) : (
        <Composer
          pending={pending}
          error={error}
          placeholder={t('replyPlaceholder')}
          minLength={1}
          onSend={send}
        />
      )}
    </>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Bubble({
  side,
  variant = 'default',
  delayMs = 0,
  children,
}: {
  side: 'start' | 'end'
  variant?: 'default' | 'ai' | 'system'
  delayMs?: number
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex', side === 'end' ? 'justify-end' : 'justify-start')}>
      <div
        style={{ animationDelay: `${delayMs}ms` }}
        className={cn(
          'max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-relaxed',
          'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards',
          // Asymmetric corners: the square one points at its author, the way
          // every messaging app signals who is speaking without a label.
          side === 'end'
            ? 'rounded-2xl rounded-ee-md bg-primary text-primary-foreground'
            : 'rounded-2xl rounded-es-md bg-card text-foreground ring-1 ring-foreground/10',
          variant === 'ai' && 'bg-accent text-accent-foreground ring-0',
          variant === 'system' &&
            'bg-transparent text-xs text-muted-foreground ring-1 ring-dashed ring-border'
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Auto-growing composer.
 *
 * Enter sends and Shift+Enter makes a newline — the messaging convention. The
 * button stays disabled below `minLength` so the "too short" rule is visible
 * before submitting rather than coming back as a validation error.
 */
function Composer({
  disabled = false,
  pending,
  error,
  placeholder,
  minLength,
  tooShortHint,
  onSend,
}: {
  disabled?: boolean
  pending: boolean
  error: string | null
  placeholder: string
  minLength: number
  tooShortHint?: string
  onSend: (body: string) => void
}) {
  const t = useTranslations('support.panel')
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = value.trim()
  const canSend = !disabled && !pending && trimmed.length >= minLength

  const grow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  }

  const submit = () => {
    if (!canSend) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  return (
    <div className="shrink-0 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {error ? (
        <p role="alert" className="mb-2 px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          'flex items-end gap-2 rounded-3xl bg-muted/60 p-1.5 ps-3.5 transition-colors',
          'focus-within:bg-muted has-disabled:opacity-60'
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          disabled={disabled || pending}
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={5000}
          onChange={(event) => {
            setValue(event.target.value)
            grow(event.target)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          className={cn(
            'max-h-[120px] min-h-[2.25rem] flex-1 resize-none bg-transparent py-2 text-sm',
            'outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label={t('send')}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full transition-all',
            canSend
              ? 'bg-primary text-primary-foreground hover:opacity-90'
              : 'bg-muted-foreground/20 text-muted-foreground'
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowUp className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {tooShortHint && !disabled && trimmed.length > 0 && trimmed.length < minLength ? (
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{tooShortHint}</p>
      ) : null}
    </div>
  )
}
