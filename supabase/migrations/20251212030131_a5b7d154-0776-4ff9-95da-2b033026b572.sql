-- Fix overly permissive RLS policies on pending_notifications and discord_notified_orders
-- Edge functions using SUPABASE_SERVICE_ROLE_KEY bypass RLS, so removing these won't break functionality

-- Drop the overly permissive "System can manage" policy on pending_notifications
-- This policy had qual=true allowing anyone (including anonymous) to access all data
DROP POLICY IF EXISTS "System can manage pending notifications" ON pending_notifications;

-- Drop the overly permissive "System can manage" policy on discord_notified_orders
-- This policy had qual=true allowing anyone (including anonymous) to access all data
DROP POLICY IF EXISTS "System can manage discord_notified_orders" ON discord_notified_orders;

-- Note: The existing restrictive policies remain in place:
-- - "Admins can view pending notifications" (SELECT only for admins)
-- - "Admins can view discord_notified_orders" (SELECT only for admins)
-- Edge functions continue to work because they use service_role which bypasses RLS