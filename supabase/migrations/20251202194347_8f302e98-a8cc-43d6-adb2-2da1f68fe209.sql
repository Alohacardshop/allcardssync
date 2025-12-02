-- Add unique constraint for user + printer_type + location
-- This allows each user to have different printer settings per location
CREATE UNIQUE INDEX IF NOT EXISTS user_printer_preferences_user_type_location_idx 
ON user_printer_preferences (user_id, printer_type, COALESCE(location_gid, ''));

-- Drop the old RLS policies and create new ones that are more permissive for the user's own data
DROP POLICY IF EXISTS "Users can view own printer preferences" ON user_printer_preferences;
DROP POLICY IF EXISTS "Users can insert own printer preferences" ON user_printer_preferences;
DROP POLICY IF EXISTS "Users can update own printer preferences" ON user_printer_preferences;
DROP POLICY IF EXISTS "Users can delete own printer preferences" ON user_printer_preferences;

-- Users can manage their own printer preferences
CREATE POLICY "Users can view own printer preferences" ON user_printer_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own printer preferences" ON user_printer_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own printer preferences" ON user_printer_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own printer preferences" ON user_printer_preferences
  FOR DELETE USING (auth.uid() = user_id);