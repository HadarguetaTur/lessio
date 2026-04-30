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

export { confirmBooking, LockExpiredError, InactiveParticipantError, NoPrimaryParentError } from './confirmBooking'
export type { ConfirmBookingParams, ConfirmBookingResult } from './confirmBooking'
