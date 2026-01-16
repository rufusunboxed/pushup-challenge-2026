-- ============================================
-- Ensure insert policy allows creating private leaderboards
-- ============================================
-- Run this in Supabase SQL Editor

DROP POLICY IF EXISTS "Users can create leaderboards" ON leaderboards;
CREATE POLICY "Users can create leaderboards"
ON leaderboards
FOR INSERT
WITH CHECK (created_by = auth.uid());
