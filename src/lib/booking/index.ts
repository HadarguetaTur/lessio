export { getAvailableSlots } from './getAvailableSlots'
export type { AvailableSlot, GetAvailableSlotsParams } from './getAvailableSlots'

export { getAvailabilitySummary, mergeSlotsIntoBands } from './getAvailabilitySummary'
export type {
  AvailabilityBand,
  AvailabilityDaySummary,
  AvailabilitySummary,
  GetAvailabilitySummaryParams,
} from './getAvailabilitySummary'

export { createSlotLock, SlotUnavailableError } from './createSlotLock'
export type { CreateSlotLockParams, SlotLock } from './createSlotLock'

export { validateSlotLock } from './validateSlotLock'
export type { SlotLockValidationResult } from './validateSlotLock'

export { confirmBooking, LockExpiredError, InactiveParticipantError, NoPrimaryParentError, LockStudentMismatchError } from './confirmBooking'
export type { ConfirmBookingParams, ConfirmBookingResult } from './confirmBooking'

export {
  weekBoundsFor,
  weekStartLocalDate,
  getWeeklyQuotaStatus,
  assertWeeklyQuotaNotExceeded,
  orgEnforcesWeeklyQuota,
  WeeklyQuotaExceededError,
} from './weeklyQuota'
export type { WeekBounds, WeeklyQuotaStatus, WeeklyQuotaParams } from './weeklyQuota'
