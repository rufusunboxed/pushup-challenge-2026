-- Verify and fix position column in leaderboard_members table
-- This script ensures the position column exists and has the correct type

-- Check if position column exists (run this first to see current state)
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'leaderboard_members' AND column_name = 'position';

-- If position column doesn't exist or is wrong type, run this:
DO $$
BEGIN
  -- Add position column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leaderboard_members' AND column_name = 'position'
  ) THEN
    ALTER TABLE leaderboard_members ADD COLUMN position INTEGER;
    RAISE NOTICE 'Added position column to leaderboard_members';
  ELSE
    RAISE NOTICE 'Position column already exists';
  END IF;
END $$;

-- Ensure position can be NULL (for existing rows)
ALTER TABLE leaderboard_members ALTER COLUMN position DROP NOT NULL;

-- Create index on position for better query performance
CREATE INDEX IF NOT EXISTS idx_leaderboard_members_user_position 
ON leaderboard_members(user_id, position);

-- Verify the column exists and show sample data
SELECT 
  user_id,
  leaderboard_id,
  position,
  joined_at
FROM leaderboard_members
ORDER BY user_id, position NULLS LAST
LIMIT 10;
