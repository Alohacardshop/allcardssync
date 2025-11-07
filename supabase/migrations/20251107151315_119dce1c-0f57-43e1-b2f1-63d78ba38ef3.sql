-- Add unique constraint to alt_items.alt_uuid to enable upserts
-- This allows the card-show-fetch-alt function to properly upsert records
-- based on certificate number without causing duplicate key errors

ALTER TABLE public.alt_items 
ADD CONSTRAINT alt_items_alt_uuid_unique UNIQUE (alt_uuid);