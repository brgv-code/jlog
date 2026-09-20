-- Stripe billing for the hosted instance (ADR-011).
--
-- `users.plan` already gates the three paid routes and is read by `requirePro`
-- as a single SELECT. Nothing here changes that. What is added is the
-- bookkeeping that decides what is allowed to WRITE it.
--
-- `plan_source` is the load-bearing column. Without it, comping an account by
-- hand and then wiring subscription webhooks is a trap with a delay fuse: the
-- first `customer.subscription.deleted`, or any reconciliation that looks for
-- pro users with no active subscription, downgrades the comped account and
-- presents as a bug rather than as policy. The webhook path writes only where
-- plan_source is 'stripe' or not yet set; 'manual' is never touched by Stripe.

ALTER TABLE `users` ADD COLUMN `plan_source` text;
ALTER TABLE `users` ADD COLUMN `stripe_customer_id` text;
ALTER TABLE `users` ADD COLUMN `stripe_subscription_id` text;
-- Straight from Stripe: active | trialing | past_due | canceled | unpaid.
-- Kept distinct from `plan` so a failed card (past_due) is not silently the
-- same event as a deliberate cancellation.
ALTER TABLE `users` ADD COLUMN `plan_status` text;
ALTER TABLE `users` ADD COLUMN `current_period_end` integer;

-- The webhook looks the user up by customer id on every subscription event, and
-- that is the only way back from Stripe's identifiers to ours.
CREATE UNIQUE INDEX `idx_users_stripe_customer` ON `users` (`stripe_customer_id`);

-- Stripe retries until it gets a 2xx, so the same event arrives more than once
-- as a matter of routine rather than as a fault. Inserting the id before doing
-- the work is what keeps a retried checkout from applying twice.
CREATE TABLE `stripe_events` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `received_at` integer NOT NULL
);
