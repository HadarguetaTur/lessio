'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface StepDef {
  id: string
  label: string
}

interface StepIndicatorProps {
  steps: StepDef[]
  currentStepId: string
}

export function StepIndicator({ steps, currentStepId }: StepIndicatorProps) {
  const t = useTranslations('onboarding.stepIndicator')
  const rawIdx = steps.findIndex((s) => s.id === currentStepId)
  const safeIdx = rawIdx >= 0 ? rawIdx : 0
  const current = steps[safeIdx]
  const displayNum = safeIdx + 1
  const total = steps.length

  return (
    <div className="mb-10 w-full min-w-0">
      {/* Mobile: שלב נוכחי בלבד */}
      <nav
        className="flex flex-col items-center sm:hidden"
        aria-label={t('navAria')}
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="mb-3 text-[11px] font-medium tabular-nums text-muted-foreground">
          {t('progress', { current: displayNum, total })}
        </p>
        <div
          key={currentStepId}
          className="flex size-11 shrink-0 animate-in fade-in zoom-in-95 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-violet-600 text-base font-bold text-white shadow-md shadow-violet-500/25 ring-4 ring-violet-500/20 duration-200"
        >
          {displayNum}
        </div>
        {current ? (
          <p className="mt-3 max-w-[16rem] text-center text-sm font-semibold leading-snug text-foreground">
            {current.label}
          </p>
        ) : null}
      </nav>

      {/* Tablet ומעלה: פס שלבים מלא */}
      <div className="hidden sm:block">
        <div className="overflow-x-auto overflow-y-hidden pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] sm:overflow-visible [&::-webkit-scrollbar]:h-1">
          <div
            className="flex min-w-min items-center justify-center gap-0 px-1 sm:min-w-0"
            role="navigation"
            aria-label={t('navAria')}
          >
            {steps.map((step, idx) => {
              const isCompleted = rawIdx >= 0 && idx < rawIdx
              const isActive = rawIdx >= 0 ? idx === rawIdx : idx === 0

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex max-w-[4.75rem] flex-col items-center gap-1.5 sm:max-w-[7rem]">
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all ${
                        isCompleted
                          ? 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-400/40'
                          : isActive
                            ? 'bg-gradient-to-br from-teal-500 to-violet-600 text-white shadow-md shadow-violet-500/20 ring-4 ring-violet-500/20'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? <Check size={16} /> : idx + 1}
                    </div>
                    <span
                      className={`w-full text-center text-[10px] font-medium leading-snug break-words sm:text-[11px] ${
                        isActive
                          ? 'text-violet-700 dark:text-violet-300'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`mx-0.5 mb-5 h-0.5 w-8 shrink-0 transition-colors sm:mx-1 sm:w-14 md:w-20 ${
                        rawIdx >= 0 && idx < rawIdx
                          ? 'bg-gradient-to-l from-teal-500 to-violet-600'
                          : 'bg-border'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
