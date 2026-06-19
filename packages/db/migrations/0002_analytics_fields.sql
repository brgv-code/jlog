ALTER TABLE `applications` ADD COLUMN `salary_min` integer;
ALTER TABLE `applications` ADD COLUMN `salary_max` integer;
ALTER TABLE `applications` ADD COLUMN `salary_currency` text DEFAULT 'USD';
ALTER TABLE `applications` ADD COLUMN `response_received_at` integer;
ALTER TABLE `users` ADD COLUMN `analytics_opt_in` integer NOT NULL DEFAULT 0;
