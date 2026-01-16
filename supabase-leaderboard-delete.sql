-- ============================================
-- Leaderboard deletion by owner
-- ============================================
-- Run this in Supabase SQL Editor

-- Allow owners to delete their own leaderboards
DROP POLICY IF EXISTS "Owners can delete leaderboards" ON leaderboards;
CREATE POLICY "Owners can delete leaderboards"
ON leaderboards
FOR DELETE
USING (created_by = auth.uid());
