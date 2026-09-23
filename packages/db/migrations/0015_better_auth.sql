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
-- table and do not carry across; accounts, applications and documents are
-- untouched.
--
-- NOTE: step 1 adds a UNIQUE constraint on `users.email`, which Better Auth
-- requires, and lowercases every address on the way across. If two rows share
-- an address — including two that differ only in case — this migration fails
-- rather than silently merging or dropping one. That is the intended
-- behaviour: resolve the duplicate by hand and re-run.
--
-- Check for that before running, so you find out by reading rather than by
-- watching a migration fail:
--
--   SELECT lower(email) AS address, count(*) AS rows
--   FROM users GROUP BY lower(email) HAVING count(*) > 1;
--
-- D1 applies a migration file atomically, so that failure leaves the database
-- exactly as it was — verified by running this against a seeded copy holding a
-- duplicate: the users table and every row hanging off it survived untouched,
-- and none of the new tables were left half-created. Note that the `sqlite3`
-- CLI does NOT behave this way: by default it continues past an error, which
-- here would carry on to the DROP below with nothing copied. Apply this with
-- wrangler, or with `sqlite3 -bail`, never with a bare `sqlite3 < file`.

PRAGMA defer_foreign_keys = true;

-- 1. Rebuild `users` without `github_id`.
--
-- SQLite cannot drop a column carrying an implicit UNIQUE index (the index has
-- an internal name and cannot be dropped), so this is the standard
-- copy/drop/rename procedure rather than an ALTER.
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
  -- Lowercased on the way across, because Better Auth lowercases an address
  -- before looking a user up by it. A row still holding "Person@Example.com"
  -- would simply not be found at sign-in, and the person would be handed a
  -- fresh empty account instead of their own.
  lower(`email`),
  `name`,
  -- Every existing row was created from a *verified* GitHub address: the old
  -- callback rejected the sign-in outright when it could not find one. So these
  -- are all genuinely verified, and marking them so is what lets someone add
  -- Google to their existing account instead of starting a second one.
  1,
  `avatar_url`, `analytics_opt_in`, `plan`, `plan_source`, `stripe_customer_id`,
  `stripe_subscription_id`, `plan_status`, `current_period_end`, `created_at`,
  `created_at`
FROM `users`;

-- 2. Better Auth's tables.

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

-- 3. Give every existing account its GitHub sign-in method. This reads the old
-- table, hence its position before the drop.
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
FROM `users`;

DROP TABLE `users`;

ALTER TABLE `users_new` RENAME TO `users`;

-- Dropping the old table dropped its indexes with it. This one is load-bearing:
-- the Stripe webhook's only route back from a customer id to our user is this
-- lookup (ADR-011).
CREATE UNIQUE INDEX `idx_users_stripe_customer` ON `users` (`stripe_customer_id`);

-- 4. `sessions` becomes extension-only.
--
-- Cookie rows are dropped rather than carried over: they belong to the session
-- scheme Better Auth has just replaced, and a stale row here would be a
-- credential nothing can any longer validate.
DELETE FROM `sessions` WHERE `type` = 'cookie';

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
SELECT `id`, `user_id`, `label`, `created_at`, `expires_at` FROM `sessions`;

DROP TABLE `sessions`;

CREATE INDEX `idx_extension_keys_user` ON `extension_keys` (`user_id`);
