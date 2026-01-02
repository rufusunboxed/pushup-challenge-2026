-- ============================================
-- Fallback: Database Function for Updating pushup_logs
-- ============================================
-- Use this ONLY if RLS policies cannot be modified
-- This function bypasses RLS but maintains security through function logic
-- ============================================

-- Step 1: Create function to update pushup_logs
-- This function ensures users can only update their own records
CREATE OR REPLACE FUNCTION update_pushup_log(
  log_id UUID,
  new_count INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
AS $$
DECLARE
  current_user_id UUID;
  result JSON;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not authenticated'
    );
  END IF;
  
  -- Update the record only if it belongs to the current user
  UPDATE pushup_logs
  SET count = new_count
  WHERE id = log_id
    AND user_id = current_user_id;
  
  -- Check if any rows were updated
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No rows updated. Record may not exist or does not belong to user.'
    );
  END IF;
  
  -- Return success with the updated record
  SELECT json_build_object(
    'success', true,
    'id', id,
    'count', count,
    'user_id', user_id
  ) INTO result
  FROM pushup_logs
  WHERE id = log_id;
  
  RETURN result;
END;
$$;

-- Step 2: Create function to delete pushup_logs
CREATE OR REPLACE FUNCTION delete_pushup_log(
  log_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not authenticated'
    );
  END IF;
  
  -- Delete the record only if it belongs to the current user
  DELETE FROM pushup_logs
  WHERE id = log_id
    AND user_id = current_user_id;
  
  -- Check if any rows were deleted
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No rows deleted. Record may not exist or does not belong to user.'
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'id', log_id
  );
END;
$$;

-- Step 3: Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION update_pushup_log(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_pushup_log(UUID) TO authenticated;

-- Step 4: Test the function (optional - remove after testing)
-- SELECT update_pushup_log('your-log-id-here'::UUID, 25);
-- SELECT delete_pushup_log('your-log-id-here'::UUID);

-- ============================================
-- To use these functions in the app:
-- 
-- Instead of:
--   supabase.from('pushup_logs').update({ count: newCount }).eq('id', submissionId)
-- 
-- Use:
--   supabase.rpc('update_pushup_log', { log_id: submissionId, new_count: newCount })
-- 
-- Instead of:
--   supabase.from('pushup_logs').delete().eq('id', submissionId)
-- 
-- Use:
--   supabase.rpc('delete_pushup_log', { log_id: submissionId })
-- ============================================

