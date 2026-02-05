-- Fix remaining RLS policies - handle existing policies with DROP IF EXISTS

-- =====================================================
-- 5. user_profiles - Users can only view their own profile (FIX)
-- =====================================================
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON user_profiles;

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all profiles" ON user_profiles
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- 6. audit_log - Admin only access (FIX)
-- =====================================================
DROP POLICY IF EXISTS "Admin can view audit_log" ON audit_log;
DROP POLICY IF EXISTS "Service role can manage audit_log" ON audit_log;

CREATE POLICY "Admin can view audit_log" ON audit_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage audit_log" ON audit_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');