-- Where an account came from (growth experiment E01): the browser's first touch
-- and the answer to "How did you find jlog?". One row per user, removed with
-- the account. The index serves the weekly funnel query, which groups by it.
-- IF NOT EXISTS so a re-run is a no-op.
CREATE TABLE IF NOT EXISTS `signup_attribution` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `channel` text,
  `referrer_host` text,
  `utm_source` text,
  `utm_medium` text,
  `utm_campaign` text,
  `landing_path` text,
  `first_seen_at` integer,
  `heard_from` text,
  `heard_from_detail` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `signup_attribution_channel_idx` ON `signup_attribution` (`channel`);
