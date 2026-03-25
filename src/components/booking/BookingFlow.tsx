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

  if (step === 'teacher') {
    return <TeacherSelect token={token} onSelect={handleTeacherSelect} />
  }

  if (step === 'availability') {
    return (
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
    )
  }

  if (step === 'confirm') {
    return (
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
    )
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

  return <BookingError errorCode={state.errorCode ?? 'unknown'} onRestart={handleRestart} />
}
