-- Enforce idempotency at the database layer for Stripe webhook processing.
-- Safe for repeated deploys / multi-instance workers.

BEGIN;

-- Deduplicate existing rows before adding uniqueness.
DELETE FROM payment_events a
USING payment_events b
WHERE a.ctid < b.ctid
  AND a.event_type = b.event_type
  AND a.stripe_id = b.stripe_id
  AND a.event_type = 'webhook_processed'
  AND a.stripe_id IS NOT NULL;

-- Ensure one processed record per Stripe event id.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_events_event_type_stripe_id
  ON payment_events (event_type, stripe_id)
  WHERE stripe_id IS NOT NULL;

COMMIT;
