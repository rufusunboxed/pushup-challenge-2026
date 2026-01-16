-- ============================================
-- Leaderboard memberships: allow members to read all members
-- ============================================
-- Run this in Supabase SQL Editor

-- Allow members to read all membership rows for their leaderboard
DROP POLICY IF EXISTS "Members can read leaderboard memberships" ON leaderboard_members;
CREATE POLICY "Members can read leaderboard memberships"
ON leaderboard_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM leaderboard_members lm
    WHERE lm.leaderboard_id = leaderboard_members.leaderboard_id
      AND lm.user_id = auth.uid()
  )
);
