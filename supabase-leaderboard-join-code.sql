-- ============================================
-- RPC: allow joining private leaderboards by code
-- ============================================
-- Run this in Supabase SQL Editor

-- Function 1: Get leaderboard ID by code (bypasses RLS for private leaderboards)
CREATE OR REPLACE FUNCTION public.get_leaderboard_id_by_code(code_input text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM leaderboards
  WHERE UPPER(TRIM(code)) = UPPER(TRIM(code_input))
  LIMIT 1;
$$;

-- Function 2: Join leaderboard by code (handles entire join process)
-- SECURITY DEFINER bypasses RLS, allowing access to private leaderboards
-- IMPORTANT: Function must be owned by postgres role to fully bypass RLS
CREATE OR REPLACE FUNCTION public.join_leaderboard_by_code(code_input text, position_input integer DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  leaderboard_uuid UUID;
  normalized_input TEXT;
  code_count INTEGER;
  all_codes TEXT;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not authenticated'
    );
  END IF;
  
  -- Normalize the input code
  normalized_input := UPPER(TRIM(code_input));
  
  -- Query with explicit schema - SECURITY DEFINER should bypass RLS
  -- Using pg_catalog to ensure we query the actual table
  SELECT id INTO leaderboard_uuid
  FROM public.leaderboards
  WHERE UPPER(TRIM(code)) = normalized_input
  LIMIT 1;
  
  -- Debug: Get all codes for troubleshooting (only if not found)
  IF leaderboard_uuid IS NULL THEN
    SELECT COUNT(*), string_agg(UPPER(TRIM(code)), ', ' ORDER BY code) INTO code_count, all_codes
    FROM public.leaderboards;
    
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid code. Please check and try again.',
      'debug_code_searched', normalized_input,
      'debug_total_leaderboards', code_count,
      'debug_all_codes', COALESCE(all_codes, 'NONE FOUND')
    );
  END IF;
  
  -- Insert membership (bypasses RLS, but we verify user_id matches)
  INSERT INTO public.leaderboard_members (leaderboard_id, user_id, position)
  VALUES (leaderboard_uuid, current_user_id, position_input)
  ON CONFLICT (leaderboard_id, user_id) DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'leaderboard_id', leaderboard_uuid
  );
END;
$$;

-- Note: In Supabase, functions created with SECURITY DEFINER should automatically
-- bypass RLS. If this still doesn't work, the function owner may need to be changed.
-- You can check the owner with: SELECT proname, proowner::regrole FROM pg_proc WHERE proname = 'join_leaderboard_by_code';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_leaderboard_id_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_id_by_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.join_leaderboard_by_code(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_leaderboard_by_code(text, integer) TO anon;
