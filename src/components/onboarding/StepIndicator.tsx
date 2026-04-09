'use client'

import { Check } from 'lucide-react'

export interface StepDef {
  id: string
  label: string
}

interface StepIndicatorProps {
  steps: StepDef[]
  currentStepId: string
}

export function StepIndicator({ steps, currentStepId }: StepIndicatorProps) {
  const currentIdx = steps.findIndex((s) => s.id === currentStepId)

  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isActive = idx === currentIdx

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? <Check size={16} /> : idx + 1}
              </div>
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`w-12 sm:w-20 h-0.5 mx-1 mb-5 transition-colors ${
                  idx < currentIdx ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
