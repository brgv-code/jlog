-- Extension keys can now outlive the day they were made (including "never"),
-- so there has to be a way to see one and kill it. Both columns are nullable
-- because every row that already exists predates them, and a cookie session
-- never shows up in the key list anyway.
ALTER TABLE `sessions` ADD COLUMN `label` text;
ALTER TABLE `sessions` ADD COLUMN `created_at` integer;
