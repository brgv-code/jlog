ALTER TABLE `sessions` ADD COLUMN `type` text NOT NULL DEFAULT 'cookie';

-- Backfill existing extension sessions, previously tagged by an 'ext_' id prefix.
UPDATE `sessions` SET `type` = 'extension' WHERE `id` LIKE 'ext_%';
