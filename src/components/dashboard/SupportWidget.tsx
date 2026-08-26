'use client'

/**
 * Floating "need help?" button + ticket form — Sprint 32 M1.
 *
 * Mounted from the dashboard layout for owners and admins only. The create
 * action arrives as a prop (never imported here) so this component stays usable
 * from any shell — see the Server Action prop rule in CLAUDE.md.
 */

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LifeBuoy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const CATEGORIES = ['bug', 'question', 'feature_request', 'other'] as const
type Category = (typeof CATEGORIES)[number]

export type CreateTicketResult = { error: string | null; ticketId?: string }

type CreateTicketAction = (
  prev: CreateTicketResult | null,
  formData: FormData
) => Promise<CreateTicketResult>

interface SupportWidgetProps {
  locale: string
  createTicket: CreateTicketAction
}

export function SupportWidget({ locale, createTicket }: SupportWidgetProps) {
  const [open, setOpen] = useState(false)
  // Bumped on every open so the panel remounts: a fresh useActionState, and no
  // returning user greeted by the success screen of yesterday's ticket.
  const [session, setSession] = useState(0)
  const t = useTranslations('support.widget')

  const handleOpenChange = (next: boolean) => {
    if (next) setSession((n) => n + 1)
    setOpen(next)
  }

  return (
    <>
      <div
        className={cn(
          // Above MobileAdminQuickSheet (z-30) and lifted clear of it on mobile,
          // where that pill occupies the bottom center.
          'fixed z-40 end-4 bottom-24 lg:bottom-6',
          'pb-[env(safe-area-inset-bottom)]'
        )}
      >
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-11 gap-2 rounded-full border border-border bg-background/95 px-4 shadow-lg backdrop-blur-md"
          onClick={() => handleOpenChange(true)}
          aria-label={t('triggerAria')}
          aria-expanded={open}
        >
          <LifeBuoy className="size-[18px] text-primary" aria-hidden />
          <span className="text-[13px] font-medium">{t('trigger')}</span>
        </Button>
      </div>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side={locale === 'he' ? 'left' : 'right'}
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>{t('description')}</SheetDescription>
          </SheetHeader>

          <SupportWidgetPanel
            key={session}
            createTicket={createTicket}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

function SupportWidgetPanel({
  createTicket,
  onNavigate,
}: {
  createTicket: CreateTicketAction
  onNavigate: () => void
}) {
  const [category, setCategory] = useState<Category>('question')
  const [state, formAction, pending] = useActionState(createTicket, null)
  const pathname = usePathname()
  const t = useTranslations('support.widget')

  if (state?.ticketId) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50">
          <Check className="size-6 text-emerald-600" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{t('sentTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('sentBody')}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/support/${state.ticketId}`} onClick={onNavigate}>
            {t('viewTicket')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 px-4 pb-6">
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="page_url" value={pathname} />
      <input
        type="hidden"
        name="user_agent"
        value={typeof navigator === 'undefined' ? '' : navigator.userAgent}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-foreground">{t('categoryLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                category === c
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              )}
            >
              {t(`category.${c}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="support-subject">{t('subjectLabel')}</Label>
        <Input
          id="support-subject"
          name="subject"
          required
          maxLength={200}
          placeholder={t('subjectPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="support-body">{t('bodyLabel')}</Label>
        <Textarea
          id="support-body"
          name="body"
          required
          rows={6}
          maxLength={5000}
          placeholder={t('bodyPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('bodyHint')}</p>
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('sending') : t('send')}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/support" onClick={onNavigate}>
            {t('myTickets')}
          </Link>
        </Button>
      </div>
    </form>
  )
}
