-- Bullets imported from moderncv PDFs before the reader learned the glyph kept
-- a leading "{ " (and some a "•"). The CV page showed them raw, and the same
-- line often exists twice: once clean, once with the marker.
--
-- First archive a marked bullet whose clean twin already sits under the same
-- role, so cleaning it does not leave two identical lines; then clean the rest.
-- Archived, not deleted: it can be restored from the CV page.
UPDATE `profile_facts`
SET `status` = 'archived'
WHERE `kind` = 'bullet'
  AND `status` = 'active'
  AND (`canonical` LIKE '{%' OR `canonical` LIKE '•%')
  AND EXISTS (
    SELECT 1 FROM `profile_facts` AS `twin`
    WHERE `twin`.`user_id` = `profile_facts`.`user_id`
      AND `twin`.`parent_fact_id` = `profile_facts`.`parent_fact_id`
      AND `twin`.`id` <> `profile_facts`.`id`
      AND `twin`.`canonical` = TRIM(SUBSTR(`profile_facts`.`canonical`, 2))
  );

UPDATE `profile_facts`
SET `canonical` = TRIM(SUBSTR(`canonical`, 2))
WHERE `kind` = 'bullet'
  AND (`canonical` LIKE '{%' OR `canonical` LIKE '•%');

-- The imported phrasing of such a bullet is the same marked text. It would be
-- offered to tailoring as a wording, marker and all; the clean canonical
-- already says the same thing.
DELETE FROM `profile_fact_variants`
WHERE `source` = 'import'
  AND (`content` LIKE '{%' OR `content` LIKE '•%');
