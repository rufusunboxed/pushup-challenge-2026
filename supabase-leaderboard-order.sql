-- ============================================
-- Leaderboard ordering: per-user positions
-- ============================================
-- Run this in Supabase SQL Editor

-- Add position column for per-user ordering
ALTER TABLE leaderboard_members
ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Backfill existing rows with a stable order per user
WITH ranked AS (
  SELECT
    leaderboard_id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY joined_at ASC, leaderboard_id ASC
    ) - 1 AS new_position
  FROM leaderboard_members
)
UPDATE leaderboard_members lm
SET position = ranked.new_position
FROM ranked
WHERE lm.leaderboard_id = ranked.leaderboard_id
  AND lm.user_id = ranked.user_id;

-- Index for ordered reads
CREATE INDEX IF NOT EXISTS idx_leaderboard_members_user_position
  ON leaderboard_members(user_id, position);
