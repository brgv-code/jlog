ALTER TABLE `users` ADD COLUMN `plan` text NOT NULL DEFAULT 'free';

CREATE TABLE `user_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL,
  `label` text NOT NULL,
  `format` text NOT NULL DEFAULT 'latex',
  `content` text NOT NULL,
  `assets` text,
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `documents` (
  `id` text PRIMARY KEY NOT NULL,
  `application_id` text NOT NULL REFERENCES `applications`(`id`) ON DELETE CASCADE,
  `user_document_id` text REFERENCES `user_documents`(`id`) ON DELETE SET NULL,
  `type` text NOT NULL,
  `format` text NOT NULL DEFAULT 'latex',
  `content` text NOT NULL,
  `assets` text,
  `status` text NOT NULL DEFAULT 'draft',
  `pdf_key` text,
  `compile_log` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `user_documents_user_id_idx` ON `user_documents` (`user_id`);
CREATE INDEX `documents_application_id_idx` ON `documents` (`application_id`);
CREATE INDEX `documents_user_document_id_idx` ON `documents` (`user_document_id`);
