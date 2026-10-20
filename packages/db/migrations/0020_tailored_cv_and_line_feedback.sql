-- ADR-015: keep the tailored CV, and record what the owner thinks of its lines.
--
-- A tailored CV was thrown away after every generation, so reopening an
-- application meant waiting for the model again. `documents` already models a
-- generated document per application; `data` holds what the tailoring page
-- needs to show it without a model call: the spec (fact ids only), the resolved
-- lines with their checks, and the model's reasoning. Nullable and ignored by
-- code still serving during a deploy.
ALTER TABLE `documents` ADD COLUMN `data` text;

-- One row per thing the owner did to a generated line: liked it, disliked it
-- (and why), regenerated, removed or edited it. The tailoring catalogue reads
-- the likes and dislikes back (disliked wordings are never offered again), and
-- the whole log is the eval set for tailoring.
CREATE TABLE `line_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `application_id` text REFERENCES `applications`(`id`) ON DELETE SET NULL,
  `fact_id` text NOT NULL,
  `variant_id` text,
  `action` text NOT NULL,
  `reason` text,
  `before_text` text,
  `after_text` text,
  `created_at` integer NOT NULL
);
CREATE INDEX `line_feedback_user_variant` ON `line_feedback` (`user_id`, `variant_id`);
