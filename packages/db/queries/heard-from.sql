-- "How did you find jlog?" against the channel the browser recorded
-- (growth experiment E01), for accounts created in the last eight weeks.
--
--   pnpm --filter @jlog/api exec wrangler d1 execute jlog --remote \
--     --file=../../packages/db/queries/heard-from.sql
--
-- Where the two disagree is the interesting part. `direct` paired with
-- `ai_assistant` is someone who read about jlog in an AI answer and typed the
-- address in, which no referrer can show.
SELECT
  COALESCE(a.heard_from, 'no answer') AS heard_from,
  COALESCE(a.channel, 'unknown') AS channel,
  COUNT(*) AS accounts,
  group_concat(a.heard_from_detail, ' | ') AS details
FROM users u
LEFT JOIN signup_attribution a ON a.user_id = u.id
WHERE u.email NOT LIKE '%@demo.jlog.ai'
  AND u.created_at >= CAST(strftime('%s', 'now', '-56 days') AS INTEGER)
GROUP BY heard_from, channel
ORDER BY accounts DESC;
