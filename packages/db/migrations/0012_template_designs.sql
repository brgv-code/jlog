-- Templates became designs rather than countries.
--
-- The first cut stored 'europe' | 'us' | 'india', which were three sets of
-- conventions over one identical moderncv layout — all three rendered as
-- moderncv's `classic` style. Remapping every one of them to 'classic' is
-- therefore faithful: nobody's output changes, because nothing ever differed.
--
-- The conventions those values carried (photo on/off, page target, section
-- order) are now per-template defaults the user adjusts. No output regression
-- either, since the renderer never consumed the old config — it lives in
-- jlog-pro and was not updated.
UPDATE `cv_profiles` SET `template` = 'classic'
  WHERE `template` IN ('europe', 'us', 'india');

-- Anything unrecognised also lands on the default rather than a broken id.
UPDATE `cv_profiles` SET `template` = 'classic'
  WHERE `template` NOT IN ('classic', 'banking', 'casual', 'oldstyle', 'fancy', 'plain');
