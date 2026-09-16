-- The non-claim half of a CV: name, contact details, and the skills /
-- education / languages blocks.
--
-- It lived in localStorage, which meant one cleared browser lost it and a
-- second machine never had it. It is also what the LaTeX header cannot render
-- without, so losing it silently disables generating anything.
--
-- A table of its own rather than a `user_documents` row. That table models a
-- LaTeX template (its format enum says so), while this is structured data the
-- renderer builds a document *from* — storing JSON in a column declared as
-- latex would make the schema lie about its contents. The photo rides here for
-- the same reason it was going to ride there: so it travels with the profile
-- instead of being re-attached by hand.
--
-- Deliberately NOT in profile_facts. That table is the verified source of truth
-- for things you did and is the only thing tailoring may select from; an email
-- address is not a claim anyone needs to audit, and mixing the two would blunt
-- what makes the fact gate meaningful.

CREATE TABLE `cv_profiles` (
  -- One per user: this is the header of their CV, not a collection.
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `first_name` text NOT NULL DEFAULT '',
  `last_name` text NOT NULL DEFAULT '',
  `title` text NOT NULL DEFAULT '',
  `address` text NOT NULL DEFAULT '',
  `email` text NOT NULL DEFAULT '',
  `homepage` text NOT NULL DEFAULT '',
  -- A filename shipped alongside the compile request, not the image itself.
  `photo` text NOT NULL DEFAULT '',
  -- JSON arrays: [{network, handle}] and [{heading, items:[{left, right}]}].
  -- Shape belongs to the renderer, which reads them whole; there is nothing to
  -- query inside them.
  `socials` text NOT NULL DEFAULT '[]',
  `summary` text NOT NULL DEFAULT '',
  `sections` text NOT NULL DEFAULT '[]',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
