-- Fix user_shopify_assignments constraint to allow multiple assignments per user

-- Drop the overly restrictive constraint
ALTER TABLE user_shopify_assignments 
DROP CONSTRAINT IF EXISTS user_single_store_constraint;

-- Add the correct unique constraint: user can have multiple assignments, 
-- but not duplicate (user_id, store_key, location_gid) combinations
ALTER TABLE user_shopify_assignments
ADD CONSTRAINT user_shopify_assignments_unique_combo 
UNIQUE (user_id, store_key, location_gid);