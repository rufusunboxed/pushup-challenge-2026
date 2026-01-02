-- ============================================
-- Supabase RLS Policy Check and Fix for pushup_logs
-- ============================================
-- Run this in your Supabase SQL Editor if updates are failing
-- ============================================

-- Step 1: Check current RLS policies on pushup_logs table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'pushup_logs'
ORDER BY cmd, policyname;

-- Step 2: Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'pushup_logs';

-- Step 3: Enable RLS if not already enabled (usually already enabled)
ALTER TABLE pushup_logs ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing UPDATE policy if it exists (to recreate it)
DROP POLICY IF EXISTS "Users can update own pushup_logs" ON pushup_logs;
DROP POLICY IF EXISTS "pushup_logs_update_policy" ON pushup_logs;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON pushup_logs;

-- Step 5: Create UPDATE policy that allows users to update their own records
CREATE POLICY "Users can update own pushup_logs"
ON pushup_logs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 6: Create DELETE policy if it doesn't exist (for delete functionality)
DROP POLICY IF EXISTS "Users can delete own pushup_logs" ON pushup_logs;
DROP POLICY IF EXISTS "pushup_logs_delete_policy" ON pushup_logs;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON pushup_logs;

CREATE POLICY "Users can delete own pushup_logs"
ON pushup_logs
FOR DELETE
USING (auth.uid() = user_id);

-- Step 7: Verify policies are created
SELECT 
  policyname,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies 
WHERE tablename = 'pushup_logs'
ORDER BY cmd, policyname;

-- ============================================
-- Expected Result:
-- You should see policies for:
-- - SELECT (users can read own records)
-- - INSERT (users can insert their own records)  
-- - UPDATE (users can update own records) ← This is what we're fixing
-- - DELETE (users can delete own records) ← This is what we're adding
-- ============================================

