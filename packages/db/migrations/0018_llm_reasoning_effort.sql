-- How hard a reasoning model should think on jlog's calls (BRG-232): default,
-- low, medium or high. Nullable so the version still serving during a deploy
-- writes rows without it, and NULL reads as "default": send nothing, let the
-- provider decide, which is what every call did before this column existed.
ALTER TABLE `llm_configs` ADD COLUMN `reasoning_effort` text;
