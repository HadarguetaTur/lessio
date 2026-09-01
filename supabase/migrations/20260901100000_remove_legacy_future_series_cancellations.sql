-- Old series cancellation materialized every future occurrence as a cancelled
-- lesson. Those rows are planning noise, not cancellation history. Remove only
-- future occurrences carrying the canonical series-cancellation reason. Some
-- old "delete series" operations nulled series_id through ON DELETE SET NULL,
-- so the reason is the durable discriminator. Manual cancellations and all
-- past rows remain.
DELETE FROM lessons
WHERE status = 'cancelled'
  AND cancel_reason = 'SERIES_CANCELLED'
  AND start_at >= CURRENT_TIMESTAMP;
