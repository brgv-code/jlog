-- Keep the CV that was imported, and where in it each fact was found.
--
-- Import read a document into `profile_facts` and discarded it. That made every
-- generated bullet traceable to a row id and to nothing a human recognises:
-- "pf_3f2a…" is not the line you wrote. The tailoring view can now put a
-- generated bullet next to the line of your own CV it was read from, which is
-- the product's claim shown rather than asserted.
--
-- The file is still never uploaded. A PDF's text layer is extracted in the
-- browser; only those words reach here, and only on import.

CREATE TABLE `cv_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  -- latex, markdown, or text — what a PDF becomes once its words are pulled out.
  `format` text NOT NULL,
  `label` text NOT NULL DEFAULT '',
  `content` text NOT NULL,
  `created_at` integer NOT NULL
);

-- Every read is "the newest source for this user", which is this index exactly.
CREATE INDEX `idx_cv_sources_user` ON `cv_sources` (`user_id`, `created_at`);

-- A half-open character range into `cv_sources.content`. Nullable on purpose:
-- facts imported before this migration have no source, and so does a fact whose
-- wording was edited afterwards. A citation with nothing to point at has to be
-- able to say so — pointing at the wrong line would be worse than pointing at
-- nothing.
ALTER TABLE `profile_facts` ADD COLUMN `source_id` text REFERENCES `cv_sources`(`id`) ON DELETE SET NULL;
ALTER TABLE `profile_facts` ADD COLUMN `source_start` integer;
ALTER TABLE `profile_facts` ADD COLUMN `source_end` integer;
