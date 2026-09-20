-- The CV template a profile defaults to.
--
-- A default rather than the whole answer: per ADR-010 the choice is overridden
-- per generation and pre-selected from the application's location. A
-- profile-only setting is modal state you set for one US application and forget
-- to change back, and forgetting means a photo on a US CV.
ALTER TABLE `cv_profiles` ADD COLUMN `template` text NOT NULL DEFAULT 'europe';
