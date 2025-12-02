-- Phase 1: Fix Data Issues - Backfill missing region_id values
UPDATE public.shopify_stores SET region_id = 'hawaii' WHERE key = 'hawaii' AND region_id IS NULL;
UPDATE public.user_shopify_assignments SET region_id = 'hawaii' WHERE store_key = 'hawaii' AND region_id IS NULL;

-- Phase 2: Remove Admin Bypass from Security Functions

-- 2.1 Fix user_can_access_store_location - remove admin bypass
CREATE OR REPLACE FUNCTION public.user_can_access_store_location(
  _user_id uuid,
  _store_key text,
  _location_gid text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN _location_gid IS NULL THEN EXISTS (
      SELECT 1 FROM public.user_shopify_assignments usa
      WHERE usa.user_id = _user_id AND usa.store_key = _store_key
    )
    ELSE EXISTS (
      SELECT 1 FROM public.user_shopify_assignments usa  
      WHERE usa.user_id = _user_id 
        AND usa.store_key = _store_key 
        AND (usa.location_gid IS NULL OR public._norm_gid(usa.location_gid) = public._norm_gid(_location_gid))
    )
  END;
$$;

-- 2.2 Fix user_can_access_region - remove admin bypass
CREATE OR REPLACE FUNCTION public.user_can_access_region(_user_id uuid, _region_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_shopify_assignments usa
    WHERE usa.user_id = _user_id AND usa.region_id = _region_id
  );
$$;

-- 2.3 Fix check_user_single_region - remove admin bypass
CREATE OR REPLACE FUNCTION public.check_user_single_region()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- All users (including admins) are restricted to one region
  IF EXISTS (
    SELECT 1 FROM public.user_shopify_assignments
    WHERE user_id = NEW.user_id 
    AND region_id IS NOT NULL
    AND region_id != COALESCE(NEW.region_id, '')
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'User can only be assigned to one region. User already has assignments in a different region.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add 'manager' to app_role enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manager' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'manager';
  END IF;
END $$;