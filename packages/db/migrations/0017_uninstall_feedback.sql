-- Answers from the page Chrome opens after the extension is uninstalled.
-- Anonymous, so no foreign key to users. The created_at index serves the
-- hourly cap in routes/feedback.ts, which counts recent rows on every submit.
-- IF NOT EXISTS so a re-run is a no-op.
CREATE TABLE IF NOT EXISTS `uninstall_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `reason` text NOT NULL,
  `message` text,
  `email` text,
  `extension_version` text,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `uninstall_feedback_created_at_idx` ON `uninstall_feedback` (`created_at`);
