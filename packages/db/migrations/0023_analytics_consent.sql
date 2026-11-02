-- The cookie banner's answer, kept on the account so the API sends product
-- analytics only for people who accepted. Null means never asked; 1 accepted;
-- 0 declined.
ALTER TABLE `users` ADD COLUMN `analytics_consent` integer;
