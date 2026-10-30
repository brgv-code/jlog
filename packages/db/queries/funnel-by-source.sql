-- Weekly sign-up funnel by channel (growth experiment E01).
--
--   pnpm --filter @jlog/api exec wrangler d1 execute jlog --remote \
--     --file=../../packages/db/queries/funnel-by-source.sql
--
-- One row per week (starting Monday) and channel, for the last eight weeks:
--   signups    accounts created that week, demo accounts left out
--   connected  of those, how many made an extension key within 7 days
--   activated  of those, how many saved an application through the extension
--              within 7 days. jlog's activation event.
--
-- The newest week is still filling in: someone who signed up yesterday has six
-- more days to activate. Read a week once it is a full week old.
--
-- `unknown` is an account with no first touch recorded: storage blocked, or
-- created before E01. `channel` comes from channelFor in @jlog/shared.
WITH signups AS (
  SELECT
    u.id,
    u.created_at,
    COALESCE(a.channel, 'unknown') AS channel
  FROM users u
  LEFT JOIN signup_attribution a ON a.user_id = u.id
  WHERE u.email NOT LIKE '%@demo.jlog.ai'
    AND u.created_at >= CAST(strftime('%s', 'now', '-56 days') AS INTEGER)
),
connected AS (
  SELECT DISTINCT s.id
  FROM signups s
  JOIN extension_keys k ON k.user_id = s.id
  WHERE k.created_at IS NOT NULL
    AND k.created_at <= s.created_at + 7 * 86400
),
activated AS (
  SELECT DISTINCT s.id
  FROM signups s
  JOIN applications ap ON ap.user_id = s.id
  JOIN events e ON e.application_id = ap.id AND e.type = 'created'
  -- The payload is stored as a JSON string holding the object, so it is
  -- unwrapped once before the field is read. Works on a plain object too.
  WHERE json_extract(json_extract(e.payload, '$'), '$.via') = 'extension'
    AND ap.created_at <= s.created_at + 7 * 86400
)
SELECT
  date(s.created_at, 'unixepoch', '-6 days', 'weekday 1') AS week_of,
  s.channel,
  COUNT(*) AS signups,
  COUNT(c.id) AS connected,
  COUNT(a.id) AS activated
FROM signups s
LEFT JOIN connected c ON c.id = s.id
LEFT JOIN activated a ON a.id = s.id
GROUP BY week_of, s.channel
ORDER BY week_of DESC, signups DESC;
