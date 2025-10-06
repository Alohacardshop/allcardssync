-- Make location_gid nullable in shopify_location_vendors to support store-wide vendors
ALTER TABLE shopify_location_vendors 
ALTER COLUMN location_gid DROP NOT NULL;

-- Add comment to clarify the change
COMMENT ON COLUMN shopify_location_vendors.location_gid IS 'Optional location GID. If NULL, vendor applies to entire store.';
