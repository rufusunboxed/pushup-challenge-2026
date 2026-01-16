-- ============================================
-- Leaderboards: opt-in membership with codes
-- ============================================
-- Run this in Supabase SQL Editor

-- Ensure uuid generation is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Leaderboards table
CREATE TABLE IF NOT EXISTS leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public', -- 'public' or 'private'
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memberships table
CREATE TABLE IF NOT EXISTS leaderboard_members (
  leaderboard_id UUID REFERENCES leaderboards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (leaderboard_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leaderboard_members_user
  ON leaderboard_members(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_members_leaderboard
  ON leaderboard_members(leaderboard_id);
CREATE INDEX IF NOT EXISTS idx_leaderboards_code
  ON leaderboards(code);
CREATE INDEX IF NOT EXISTS idx_leaderboards_visibility
  ON leaderboards(visibility);

-- Enable RLS
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_members ENABLE ROW LEVEL SECURITY;

-- Policies: leaderboards
DROP POLICY IF EXISTS "Public leaderboards are readable" ON leaderboards;
CREATE POLICY "Public leaderboards are readable"
ON leaderboards
FOR SELECT
USING (visibility = 'public');

DROP POLICY IF EXISTS "Members can read leaderboards" ON leaderboards;
CREATE POLICY "Members can read leaderboards"
ON leaderboards
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM leaderboard_members lm
    WHERE lm.leaderboard_id = leaderboards.id
      AND lm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create leaderboards" ON leaderboards;
CREATE POLICY "Users can create leaderboards"
ON leaderboards
FOR INSERT
WITH CHECK (created_by = auth.uid());

-- Policies: memberships
DROP POLICY IF EXISTS "Users can read own memberships" ON leaderboard_members;
CREATE POLICY "Users can read own memberships"
ON leaderboard_members
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can join leaderboards" ON leaderboard_members;
CREATE POLICY "Users can join leaderboards"
ON leaderboard_members
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Optional: allow users to leave leaderboards later if needed
DROP POLICY IF EXISTS "Users can leave leaderboards" ON leaderboard_members;
CREATE POLICY "Users can leave leaderboards"
ON leaderboard_members
FOR DELETE
USING (user_id = auth.uid());

-- Seed: All Users leaderboard (public), no auto-join
INSERT INTO leaderboards (code, name, visibility, created_by)
VALUES ('ALLUSERS', 'All Users', 'public', NULL)
ON CONFLICT (code) DO NOTHING;
