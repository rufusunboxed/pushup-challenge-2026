-- ============================================
-- Ensure leaderboards.visibility allows 'private'
-- ============================================
-- Run this in Supabase SQL Editor

-- If visibility is an enum type, ensure it includes 'private'
DO $$
DECLARE
  enum_name text;
BEGIN
  SELECT t.typname INTO enum_name
  FROM pg_attribute a
  JOIN pg_type t ON a.atttypid = t.oid
  JOIN pg_class c ON a.attrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relname = 'leaderboards'
    AND a.attname = 'visibility'
    AND t.typtype = 'e';

  IF enum_name IS NOT NULL THEN
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''private''', enum_name);
  END IF;
END $$;

-- If visibility is text with a CHECK constraint, drop and recreate with private allowed
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'leaderboards'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%visibility%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE leaderboards DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE leaderboards
  ADD CONSTRAINT leaderboards_visibility_check
  CHECK (visibility IN ('public', 'private'));
