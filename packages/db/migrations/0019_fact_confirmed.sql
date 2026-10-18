-- When the owner vouched for a fact (BRG-231). Tailoring uses only facts with
-- this set: ones read from a CV the owner imported and ticked, ones the owner
-- edited, and ones the owner chose to keep. Facts seeded from older, often AI
-- tailored applications stay NULL until kept, because some of them say things
-- the owner never did.
--
-- Nullable and ignored by the code still serving during a deploy.
ALTER TABLE `profile_facts` ADD COLUMN `confirmed_at` integer;

-- What is already provably the owner's: a bullet with a position in an
-- imported CV, or one whose words the in-app import or an edit stored.
UPDATE `profile_facts` SET `confirmed_at` = `updated_at`
WHERE `source_id` IS NOT NULL
   OR `id` IN (
     SELECT `fact_id` FROM `profile_fact_variants` WHERE `source` IN ('import', 'edited')
   );

-- A role is confirmed when any of its bullets is.
UPDATE `profile_facts` SET `confirmed_at` = `updated_at`
WHERE `kind` = 'role'
  AND `id` IN (
    SELECT `parent_fact_id` FROM `profile_facts`
    WHERE `confirmed_at` IS NOT NULL AND `parent_fact_id` IS NOT NULL
  );
