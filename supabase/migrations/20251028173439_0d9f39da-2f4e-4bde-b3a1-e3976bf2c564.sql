-- Fix Las Vegas Region Assignments and Region Constraint
-- Allows multiple stores within same region, but prevents cross-region assignments

-- 1. Drop the incorrect unique constraint
DROP INDEX IF EXISTS public.idx_user_single_region;

-- 2. Create trigger function to enforce single region per user
CREATE OR REPLACE FUNCTION public.enforce_single_region_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  existing_region text;
BEGIN
  -- Get user's existing region (if any)
  SELECT DISTINCT region_id INTO existing_region
  FROM public.user_shopify_assignments
  WHERE user_id = NEW.user_id
  AND region_id IS NOT NULL
  LIMIT 1;

  -- If user has existing assignments in a different region, reject
  IF existing_region IS NOT NULL AND existing_region != NEW.region_id THEN
    RAISE EXCEPTION 'User can only be assigned to stores in one region. Already assigned to region: %', existing_region;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Create trigger to enforce single region
DROP TRIGGER IF EXISTS enforce_single_region ON public.user_shopify_assignments;
CREATE TRIGGER enforce_single_region
  BEFORE INSERT OR UPDATE ON public.user_shopify_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_region_assignment();

-- 4. Update shopify_stores to set region_id for Las Vegas
UPDATE public.shopify_stores
SET region_id = 'las_vegas',
    updated_at = now()
WHERE key = 'las_vegas'
AND region_id IS NULL;

-- 5. Update user_shopify_assignments to set region_id for Las Vegas users
UPDATE public.user_shopify_assignments
SET region_id = 'las_vegas'
WHERE store_key = 'las_vegas'
AND region_id IS NULL;