CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `github_id` integer NOT NULL UNIQUE,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `avatar_url` text,
  `created_at` integer NOT NULL
);

CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL
);

CREATE TABLE `applications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `company` text NOT NULL,
  `role` text NOT NULL,
  `location` text,
  `status` text NOT NULL DEFAULT 'applied',
  `source_url` text,
  `source_site` text,
  `applied_at` integer,
  `notes` text,
  `metadata` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `llm_configs` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `provider` text NOT NULL,
  `api_key_encrypted` text,
  `model` text NOT NULL,
  `ollama_url` text,
  `updated_at` integer NOT NULL
);

CREATE TABLE `events` (
  `id` text PRIMARY KEY NOT NULL,
  `application_id` text NOT NULL REFERENCES `applications`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
CREATE INDEX `applications_user_id_idx` ON `applications` (`user_id`);
CREATE INDEX `applications_status_idx` ON `applications` (`status`);
CREATE INDEX `events_application_id_idx` ON `events` (`application_id`);
