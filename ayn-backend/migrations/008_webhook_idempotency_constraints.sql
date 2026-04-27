-- Enforce idempotency at the database layer for Stripe webhook processing.
-- Safe for repeated deploys / multi-instance workers.
-- NOTE: payment_events uses stripe_event_id (not stripe_id)

-- stripe_event_id already has UNIQUE constraint from 001_initial_schema.sql
-- Nothing to do here - idempotency is already enforced at the schema level.

SELECT 1;
