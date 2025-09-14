-- Add unique constraint to prevent users from being assigned to multiple stores
-- This will enforce one store per user
ALTER TABLE user_shopify_assignments 
DROP CONSTRAINT IF EXISTS user_shopify_assignments_user_id_store_key_location_gid_key;

-- Add new unique constraint on user_id only to enforce single store per user
ALTER TABLE user_shopify_assignments 
ADD CONSTRAINT user_single_store_constraint UNIQUE (user_id);

-- Create index for better performance on user_id lookups
CREATE INDEX IF NOT EXISTS idx_user_shopify_assignments_user_id 
ON user_shopify_assignments (user_id);

-- Update any existing users who have multiple store assignments to keep only their default one
-- or the first one if no default exists
WITH ranked_assignments AS (
  SELECT 
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY is_default DESC, created_at ASC
    ) as rn
  FROM user_shopify_assignments
)
DELETE FROM user_shopify_assignments 
WHERE id IN (
  SELECT id FROM ranked_assignments WHERE rn > 1
);

-- Add comment to document the constraint
COMMENT ON CONSTRAINT user_single_store_constraint ON user_shopify_assignments 
IS 'Ensures each user can only be assigned to one store, but can have multiple locations within that store';