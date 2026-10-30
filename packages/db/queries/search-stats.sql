-- One person's job search in numbers, by board (growth experiment E09: a post
-- built on real data). Aggregates only: no company names, roles or notes.
--
-- Replace the address on the marked line, then:
--   pnpm --filter @jlog/api exec wrangler d1 execute jlog --remote \
--     --file=../../packages/db/queries/search-stats.sql
--
-- replied   any sign of an answer: a response date, or a status past applied
-- ghosted   still "applied", no response, applied more than 21 days ago
-- days_to_reply  average days from applying to the response date, where both
--                are recorded
WITH mine AS (
  SELECT a.*
  FROM applications a
  JOIN users u ON u.id = a.user_id
  WHERE lower(u.email) = lower('you@example.com') -- ← your address
    AND a.status <> 'saved'
)
SELECT
  COALESCE(source_site, 'added by hand') AS board,
  COUNT(*) AS applications,
  SUM(CASE WHEN response_received_at IS NOT NULL
             OR status IN ('interviewing', 'offer', 'rejected') THEN 1 ELSE 0 END) AS replied,
  SUM(CASE WHEN status IN ('interviewing', 'offer') THEN 1 ELSE 0 END) AS interviews,
  SUM(CASE WHEN status = 'applied'
            AND response_received_at IS NULL
            AND COALESCE(applied_at, created_at) < CAST(strftime('%s', 'now', '-21 days') AS INTEGER)
           THEN 1 ELSE 0 END) AS ghosted,
  ROUND(AVG(CASE WHEN response_received_at IS NOT NULL AND applied_at IS NOT NULL
                 THEN (response_received_at - applied_at) / 86400.0 END), 1) AS days_to_reply
FROM mine
GROUP BY board
ORDER BY applications DESC;
