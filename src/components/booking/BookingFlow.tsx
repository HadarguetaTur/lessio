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
import { DateDurationSelect } from './DateDurationSelect'
import { SlotSelect } from './SlotSelect'
import { BookingConfirm } from './BookingConfirm'
import { BookingSuccess } from './BookingSuccess'
import { BookingError } from './BookingError'

type Step = 'teacher' | 'date_duration' | 'slot' | 'confirm' | 'success' | 'error'

interface FlowState {
  teacherId?: string
  teacherName?: string
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
    setState(s => ({ ...s, teacherId, teacherName }))
    setStep('date_duration')
  }

  function handleDateDurationSelect(date: string, durationMinutes: number) {
    setState(s => ({ ...s, date, durationMinutes }))
    setStep('slot')
  }

  function handleSlotLocked(slot: AvailableSlot, lock: SlotLock) {
    setState(s => ({ ...s, slot, lock }))
    setStep('confirm')
  }

  function handleLockExpired() {
    setState(s => ({ ...s, slot: undefined, lock: undefined }))
    setStep('slot')
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

  if (step === 'date_duration') {
    return (
      <DateDurationSelect
        teacherId={state.teacherId!}
        teacherName={state.teacherName!}
        token={token}
        onSelect={handleDateDurationSelect}
        onBack={() => setStep('teacher')}
      />
    )
  }

  if (step === 'slot') {
    return (
      <SlotSelect
        token={token}
        teacherId={state.teacherId!}
        teacherName={state.teacherName!}
        date={state.date!}
        durationMinutes={state.durationMinutes!}
        onLocked={handleSlotLocked}
        onBack={() => setStep('date_duration')}
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
        studentId={payload.studentId}
        onConfirmed={handleConfirmed}
        onLockExpired={handleLockExpired}
        onError={handleError}
      />
    )
  }

  if (step === 'success') {
    return <BookingSuccess result={state.result!} teacherName={state.teacherName!} />
  }

  return <BookingError errorCode={state.errorCode ?? 'unknown'} onRestart={handleRestart} />
}
