-- Company logos, cached once and shared by every user.
--
-- A logo is not user data: it is a fact about a company, identical for everyone
-- who applies there. Keying on a normalised company name rather than a user id
-- means the hundredth person to track Stripe costs no fetch at all.
--
-- `missing` is the negative half of the cache and matters as much as the
-- positive one. Without it, every render of a company we failed to resolve
-- retries the fetch forever.
CREATE TABLE `company_logos` (
  -- Normalised company name: lowercased, legal suffixes and punctuation
  -- stripped. See normaliseCompany() — the two must not drift.
  `company_key` text PRIMARY KEY NOT NULL,
  -- The name as first seen, kept only so a human can tell what a key meant.
  `display_name` text NOT NULL,
  `r2_key` text,
  `content_type` text,
  `bytes` integer,
  -- Where it came from, so a bad capture can be traced back to the board.
  `source_url` text,
  -- 1 when we looked and found nothing. Stops the retry loop.
  `missing` integer NOT NULL DEFAULT 0,
  `fetched_at` integer NOT NULL
);
