'use client'

/**
 * BookingFlow — top-level client component orchestrating the booking steps.
 * Steps: teacher → date+duration → slot → confirm → success/error
 * All booking writes go through Server Actions in /app/book/[token]/actions.ts.
 */

import { useState } from 'react'
import type { BookingTokenPayload } from '@/lib/jwt'
import type { AvailableSlot, SlotLock } from '@/lib/booking'
import type { ConfirmBookingResult } from '@/lib/booking'
import { TeacherSelect } from './TeacherSelect'
import { AvailabilityCalendar, type AvailabilitySelection } from './AvailabilityCalendar'
import { BookingConfirm } from './BookingConfirm'
import { BookingSuccess } from './BookingSuccess'
import { BookingError } from './BookingError'

type Step = 'teacher' | 'availability' | 'confirm' | 'success' | 'error'

interface FlowState {
  teacherId?: string
  teacherName?: string
  weekStart?: string
  timezone?: string
  date?: string
  durationMinutes?: number
  slot?: AvailableSlot
  lock?: SlotLock
  result?: ConfirmBookingResult
  errorCode?: string
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'teacher',      label: 'מורה' },
  { id: 'availability', label: 'תאריך ושעה' },
  { id: 'confirm',      label: 'אישור' },
]

function StepIndicator({ current }: { current: Step }) {
  const activeSteps = ['teacher', 'availability', 'confirm']
  const currentIdx = activeSteps.indexOf(current)

  if (currentIdx === -1) return null

  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isActive = idx === currentIdx

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? '✓' : idx + 1}
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mx-1 mb-4 transition-colors ${
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

interface BookingFlowProps {
  token: string
  payload: BookingTokenPayload
}

export function BookingFlow({ token, payload }: BookingFlowProps) {
  const [step, setStep] = useState<Step>('teacher')
  const [state, setState] = useState<FlowState>({})

  function handleTeacherSelect(teacherId: string, teacherName: string) {
    setState({
      teacherId,
      teacherName,
      durationMinutes: state.durationMinutes ?? 60,
    })
    setStep('availability')
  }

  function handleAvailabilityLocked(selection: AvailabilitySelection) {
    setState((s) => ({
      ...s,
      date: selection.date,
      durationMinutes: selection.durationMinutes,
      weekStart: selection.weekStart,
      timezone: selection.timezone,
      slot: selection.slot,
      lock: selection.lock,
    }))
    setStep('confirm')
  }

  function handleLockExpired() {
    setState(s => ({ ...s, slot: undefined, lock: undefined }))
    setStep('availability')
  }

  function handleConfirmed(result: ConfirmBookingResult) {
    setState(s => ({ ...s, result }))
    setStep('success')
  }

  function handleError(errorCode: string) {
    setState(s => ({ ...s, errorCode }))
    setStep('error')
  }

  function handleRestart() {
    setState({})
    setStep('teacher')
  }

  if (step === 'success') {
    return (
      <BookingSuccess
        result={state.result!}
        teacherName={state.teacherName!}
        timezone={state.timezone ?? 'UTC'}
      />
    )
  }

  if (step === 'error') {
    return <BookingError errorCode={state.errorCode ?? 'unknown'} onRestart={handleRestart} />
  }

  return (
    <main className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="max-w-sm w-full pt-10">
        <div className="mb-6 text-center">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto mb-3">
            <span className="text-primary-foreground text-sm font-bold leading-none">L</span>
          </div>
          <p className="text-xs text-muted-foreground">LESSIO · קביעת שיעור</p>
        </div>

        <StepIndicator current={step} />

        {step === 'teacher' && (
          <TeacherSelect token={token} onSelect={handleTeacherSelect} inline />
        )}

        {step === 'availability' && (
          <AvailabilityCalendar
            token={token}
            teacherId={state.teacherId!}
            teacherName={state.teacherName!}
            initialWeekStart={state.weekStart}
            initialDate={state.date}
            initialDurationMinutes={state.durationMinutes}
            onLocked={handleAvailabilityLocked}
            onBack={() => setStep('teacher')}
            onError={handleError}
          />
        )}

        {step === 'confirm' && (
          <BookingConfirm
            token={token}
            teacherId={state.teacherId!}
            teacherName={state.teacherName!}
            date={state.date!}
            slot={state.slot!}
            lock={state.lock!}
            timezone={state.timezone ?? 'UTC'}
            studentId={payload.studentId}
            onConfirmed={handleConfirmed}
            onLockExpired={handleLockExpired}
            onError={handleError}
          />
        )}
      </div>
    </main>
  )
}
