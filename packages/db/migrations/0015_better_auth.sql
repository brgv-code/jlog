-- Move authentication onto Better Auth, and add Google, Apple and emailed
-- magic-link sign-in alongside GitHub.
--
-- Four things happen here:
--
--   1. `users` is rebuilt. It carried `github_id NOT NULL UNIQUE`, which made a
--      person *be* their GitHub account — there was nowhere to put a Google
--      subject id, and no row could exist without a GitHub one. It also gains
--      the three columns Better Auth requires: a unique email, `email_verified`
--      and `updated_at`.
--   2. Better Auth's own tables are created: sessions, accounts (one row per
--      sign-in method) and verifications (outstanding magic links).
--   3. Every existing account is given a GitHub account row, so people land
--      back in their own data rather than in a fresh empty account.
--   4. `sessions` becomes `extension_keys`. It was doing two jobs — browser
--      sessions and the extension's bearer keys — and Better Auth takes over
--      the first. What is left is only ever the second, so it is named for it.
--
-- Everyone signs in once more after this. Browser sessions were rows in the old
-- table and do not carry across; accounts, applications and documents survive.
--
--
-- WHY THIS PARKS EVERY USER-OWNED TABLE FIRST
--
-- Replacing `users` cannot be done in place, and cannot be done naively.
--
--   * `ALTER TABLE users DROP COLUMN github_id` is refused: SQLite will not
--     drop a column carrying a UNIQUE constraint, and its implicit index has an
--     internal name that cannot be dropped either. So the table must be rebuilt.
--
--   * `DROP TABLE users` is implemented as an implicit DELETE FROM, and foreign
--     key *actions* run during it. Ten tables reference `users` with ON DELETE
--     CASCADE, directly or through `applications`, so the drop empties all of
--     them. `PRAGMA defer_foreign_keys` does not help: it defers the checking
--     of constraint *violations*, and a CASCADE is not a violation.
--
--   * `PRAGMA foreign_keys = OFF` does not help either. D1 does not permit it —
--     the statement is accepted and ignored, which is worse than an error.
--
--   * Renaming instead of dropping does not help. `PRAGMA legacy_alter_table`
--     is likewise accepted and ignored on D1, so `ALTER TABLE users RENAME`
--     rewrites the foreign keys in every child to point at the renamed table,
--     dragging them along and putting the problem back.
--
-- All four of those were measured against a seeded D1 database, not reasoned
-- about. The naive copy/drop/rename version took applications from 3 to 0 and
-- emptied documents, CV sources, profile facts, the LLM config, the extension
-- keys and even the GitHub account rows it had just written. It passed under
-- the `sqlite3` CLI only because that tool leaves foreign keys OFF by default.
--
-- So the rows are copied into constraint-free `_park_` tables first, the drop
-- is allowed to empty the real ones, and the rows go back afterwards. The parked
-- copies carry no foreign keys, so nothing cascades into them.

PRAGMA defer_foreign_keys = true;

-- 1. Park every table reachable from `users`.
--
-- Eight reference it directly; `events` and `documents` reach it through
-- `applications`. `company_logos` and `stripe_events` are global and are the
-- only two tables deliberately absent from this list.
--
-- `CREATE TABLE ... AS SELECT` copies the rows and the column order but none of
-- the constraints, which is exactly what is wanted: these copies must be
-- immune to the cascade that is about to happen.
CREATE TABLE `_park_sessions` AS SELECT * FROM `sessions`;
CREATE TABLE `_park_applications` AS SELECT * FROM `applications`;
CREATE TABLE `_park_llm_configs` AS SELECT * FROM `llm_configs`;
CREATE TABLE `_park_user_documents` AS SELECT * FROM `user_documents`;
CREATE TABLE `_park_documents` AS SELECT * FROM `documents`;
CREATE TABLE `_park_events` AS SELECT * FROM `events`;
CREATE TABLE `_park_cv_sources` AS SELECT * FROM `cv_sources`;
CREATE TABLE `_park_cv_profiles` AS SELECT * FROM `cv_profiles`;
CREATE TABLE `_park_profile_facts` AS SELECT * FROM `profile_facts`;
CREATE TABLE `_park_profile_fact_variants` AS SELECT * FROM `profile_fact_variants`;

-- The GitHub ids have to outlive the old table too — they are what step 5
-- turns into sign-in methods.
CREATE TABLE `_park_github` AS
  SELECT `id`, `github_id`, `created_at` FROM `users`;

-- 2. Build the replacement for `users`.
--
-- NOTE: `email` gains a UNIQUE constraint, which Better Auth requires, and
-- every address is lowercased on the way across. If two rows share an address —
-- including two differing only in case — this INSERT fails and the whole
-- migration rolls back, rather than silently merging or dropping one. Check
-- beforehand so you find out by reading rather than by watching it fail:
--
--   SELECT lower(email) AS address, count(*) AS rows
--   FROM users GROUP BY lower(email) HAVING count(*) > 1;
CREATE TABLE `users_new` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `email_verified` integer NOT NULL DEFAULT 0,
  `avatar_url` text,
  `analytics_opt_in` integer NOT NULL DEFAULT 0,
  `plan` text NOT NULL DEFAULT 'free',
  `plan_source` text,
  `stripe_customer_id` text,
  `stripe_subscription_id` text,
  `plan_status` text,
  `current_period_end` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

INSERT INTO `users_new` (
  `id`, `email`, `name`, `email_verified`, `avatar_url`, `analytics_opt_in`,
  `plan`, `plan_source`, `stripe_customer_id`, `stripe_subscription_id`,
  `plan_status`, `current_period_end`, `created_at`, `updated_at`
)
SELECT
  `id`,
  -- Lowercased because Better Auth lowercases an address before looking a user
  -- up by it. A row still holding "Person@Example.com" would simply not be
  -- found at sign-in, and the person would be handed a fresh empty account
  -- instead of their own.
  lower(`email`),
  `name`,
  -- Every existing row was created from a *verified* GitHub address: the old
  -- callback rejected the sign-in outright when it could not find one. So these
  -- are genuinely verified, and saying so is what lets someone add Google to
  -- their existing account instead of starting a second one.
  1,
  `avatar_url`, `analytics_opt_in`, `plan`, `plan_source`, `stripe_customer_id`,
  `stripe_subscription_id`, `plan_status`, `current_period_end`, `created_at`,
  `created_at`
FROM `users`;

-- 3. Swap the table in.
--
-- This DROP empties all ten tables parked above. That is expected, and is the
-- entire reason they were parked.
DROP TABLE `users`;

ALTER TABLE `users_new` RENAME TO `users`;

-- The old table's indexes went with it. This one is load-bearing: the Stripe
-- webhook's only route back from a customer id to our user is this lookup
-- (ADR-011).
CREATE UNIQUE INDEX `idx_users_stripe_customer` ON `users` (`stripe_customer_id`);

-- 4. Better Auth's tables.

CREATE TABLE `auth_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  -- The value the cookie carries. Separate from the row id, and the secret half.
  `token` text NOT NULL UNIQUE,
  `expires_at` integer NOT NULL,
  `ip_address` text,
  `user_agent` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_auth_sessions_user` ON `auth_sessions` (`user_id`);

CREATE TABLE `auth_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  -- The provider's own id for the account: GitHub's numeric id, Google's and
  -- Apple's `sub`. For the magic link it is the address itself.
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `access_token` text,
  `refresh_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `id_token` text,
  -- Only ever written by Better Auth's email-and-password provider, which jlog
  -- does not enable. Present because the library's schema requires it.
  `password` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- The lookup every callback does first, and the constraint that stops one
-- provider account being attached to two different users.
CREATE UNIQUE INDEX `idx_auth_accounts_provider_account`
  ON `auth_accounts` (`provider_id`, `account_id`);

CREATE INDEX `idx_auth_accounts_user` ON `auth_accounts` (`user_id`);

CREATE TABLE `auth_verifications` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_auth_verifications_identifier`
  ON `auth_verifications` (`identifier`);

-- 5. Give every existing account its GitHub sign-in method.
--
-- `account_id` is the GitHub id as text, because that is what Better Auth looks
-- up with: it takes the numeric `id` from the GitHub profile and calls String()
-- on it before querying. Storing it any other way would hand an existing user a
-- brand new empty account.
INSERT INTO `auth_accounts` (
  `id`, `user_id`, `account_id`, `provider_id`, `created_at`, `updated_at`
)
SELECT
  'acc_' || `id`,
  `id`,
  CAST(`github_id` AS text),
  'github',
  `created_at`,
  `created_at`
FROM `_park_github`;

-- 6. Put the parked rows back, parents before children.
INSERT INTO `cv_sources` SELECT * FROM `_park_cv_sources`;
INSERT INTO `cv_profiles` SELECT * FROM `_park_cv_profiles`;
INSERT INTO `applications` SELECT * FROM `_park_applications`;
INSERT INTO `llm_configs` SELECT * FROM `_park_llm_configs`;
INSERT INTO `user_documents` SELECT * FROM `_park_user_documents`;
INSERT INTO `profile_facts` SELECT * FROM `_park_profile_facts`;
INSERT INTO `profile_fact_variants` SELECT * FROM `_park_profile_fact_variants`;
INSERT INTO `events` SELECT * FROM `_park_events`;
INSERT INTO `documents` SELECT * FROM `_park_documents`;

-- 7. `sessions` becomes extension-only.
--
-- Cookie rows are left behind rather than carried over: they belong to the
-- session scheme Better Auth has just replaced, and a stale row here would be a
-- credential nothing can any longer validate.
CREATE TABLE `extension_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  -- `label` and `created_at` came in with the key list (0014) and carry across
  -- unchanged: the revoke list in Settings is only readable because of them.
  -- Both stay nullable, since keys minted before that migration have neither.
  `label` text,
  `created_at` integer,
  -- A non-expiring key stores the year-9999 sentinel rather than null.
  `expires_at` integer NOT NULL
);

INSERT INTO `extension_keys` (`id`, `user_id`, `label`, `created_at`, `expires_at`)
SELECT `id`, `user_id`, `label`, `created_at`, `expires_at`
FROM `_park_sessions`
WHERE `type` = 'extension';

CREATE INDEX `idx_extension_keys_user` ON `extension_keys` (`user_id`);

-- Safe to drop: nothing references `sessions`, and it is empty by now anyway.
DROP TABLE `sessions`;

-- 8. Clear the parking.
DROP TABLE `_park_sessions`;
DROP TABLE `_park_applications`;
DROP TABLE `_park_llm_configs`;
DROP TABLE `_park_user_documents`;
DROP TABLE `_park_documents`;
DROP TABLE `_park_events`;
DROP TABLE `_park_cv_sources`;
DROP TABLE `_park_cv_profiles`;
DROP TABLE `_park_profile_facts`;
DROP TABLE `_park_profile_fact_variants`;
DROP TABLE `_park_github`;
