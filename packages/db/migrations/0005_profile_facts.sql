-- Structured career facts: the source of truth tailoring selects from (ADR-005).
--
-- Two tables on purpose. A single fact recurs across applications in different
-- phrasings, each tuned to the role it was written for, so the canonical claim
-- and its wordings are separate things. Evidence: across 67 hand-tailored CVs
-- there are ~478 distinct bullets that collapse to a far smaller set of actual
-- achievements. The base CV holds only 12 of them, which is why facts are seeded
-- from the whole corpus rather than from the base document.

CREATE TABLE `profile_facts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  -- Open set, like documents.type. Known: role, bullet, skill, education,
  -- project, summary. A bullet hangs off its role via parent_fact_id.
  `kind` text NOT NULL,
  `parent_fact_id` text REFERENCES `profile_facts`(`id`) ON DELETE CASCADE,
  -- Set on role-kind facts; null on the bullets beneath them, which inherit
  -- context from the parent rather than duplicating it.
  `employer` text,
  `role_title` text,
  `location` text,
  -- Text, not integers: CV dates are imprecise and sometimes open ended
  -- ("2025--current"). Storing what the CV says beats inventing a precision
  -- the source never had.
  `start_date` text,
  `end_date` text,
  -- The canonical phrasing of the claim. Variants carry the real wordings.
  `canonical` text NOT NULL,
  `tags` text,
  -- active: in play. parked: true but deliberately held back unless a JD asks
  -- for it (the base CV already encodes this as "% PARKED" comments).
  -- archived: no longer used.
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE TABLE `profile_fact_variants` (
  `id` text PRIMARY KEY NOT NULL,
  `fact_id` text NOT NULL REFERENCES `profile_facts`(`id`) ON DELETE CASCADE,
  -- Denormalised from the parent fact so import can dedupe per user without a
  -- join, and so a variant is never orphaned from its owner.
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `content` text NOT NULL,
  -- Hash of the normalised content. The uniqueness constraint below is what
  -- makes corpus import idempotent: re-running it cannot duplicate a phrasing.
  `content_hash` text NOT NULL,
  -- Where this phrasing came from, and what it was aimed at. The role title and
  -- company a variant was written for is the selection signal the tailoring
  -- agent learns from, and it is free: every past application already recorded it.
  `source` text,
  `source_role_title` text,
  `source_company` text,
  `used_at` integer,
  `created_at` integer NOT NULL
);

CREATE INDEX `profile_facts_user_id_idx` ON `profile_facts` (`user_id`);
CREATE INDEX `profile_facts_parent_idx` ON `profile_facts` (`parent_fact_id`);
CREATE INDEX `profile_facts_user_kind_idx` ON `profile_facts` (`user_id`, `kind`);
CREATE INDEX `profile_fact_variants_fact_id_idx` ON `profile_fact_variants` (`fact_id`);
CREATE UNIQUE INDEX `profile_fact_variants_user_hash_unq` ON `profile_fact_variants` (`user_id`, `content_hash`);
