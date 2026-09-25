-- Saved answers for application autofill (ADR-012 phase 2): phone, work
-- authorisation, salary, notice period, EEO. One JSON document per user so a
-- new answer does not need a migration. IF NOT EXISTS so a re-run is a no-op.
CREATE TABLE IF NOT EXISTS `autofill_values` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `data` text NOT NULL DEFAULT '{}',
  `updated_at` integer NOT NULL
);
