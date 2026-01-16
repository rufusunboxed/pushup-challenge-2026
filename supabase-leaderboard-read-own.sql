-- ============================================
-- Allow creators to read their own leaderboards
-- ============================================
-- Run this in Supabase SQL Editor

DROP POLICY IF EXISTS "Creators can read leaderboards" ON leaderboards;
CREATE POLICY "Creators can read leaderboards"
ON leaderboards
FOR SELECT
TO authenticated
USING (created_by = auth.uid());
