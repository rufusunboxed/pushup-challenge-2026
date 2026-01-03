-- Migration: Add display_name and profile_color to profiles table
-- Run this in your Supabase SQL Editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS profile_color TEXT DEFAULT 'green';

-- Optional: Update existing rows to have default profile_color
UPDATE profiles 
SET profile_color = 'green' 
WHERE profile_color IS NULL;

