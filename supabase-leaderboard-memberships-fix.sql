-- ============================================
-- Fix RLS recursion for leaderboard_members
-- ============================================
-- Run this in Supabase SQL Editor

-- Remove recursive policy
DROP POLICY IF EXISTS "Members can read leaderboard memberships" ON leaderboard_members;

-- Allow members to read all memberships for a leaderboard
CREATE POLICY "Members can read leaderboard memberships"
ON leaderboard_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM leaderboards lb
    WHERE lb.id = leaderboard_members.leaderboard_id
      AND (
        lb.visibility = 'public'
        OR EXISTS (
          SELECT 1
          FROM leaderboard_members lm
          WHERE lm.leaderboard_id = lb.id
            AND lm.user_id = auth.uid()
        )
      )
  )
);
