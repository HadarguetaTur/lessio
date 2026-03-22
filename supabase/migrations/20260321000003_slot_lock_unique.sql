-- Migration: 20260321000003_slot_lock_unique.sql
-- Unique partial index on slot_locks to enforce concurrent-safe locking.
--
-- Without this index, two simultaneous createSlotLock calls can both pass the
-- availability check and both insert active locks for the same slot.
-- With this index, the second insert fails with a 23505 unique-constraint violation,
-- which createSlotLock catches and surfaces as SlotUnavailableError.
--
-- Per /docs/sprint-1-scope.md: "Prevents duplicate locks on the same slot (concurrent-safe)"

CREATE UNIQUE INDEX idx_slot_locks_active_unique
  ON slot_locks (teacher_id, start_at)
  WHERE status = 'active';
