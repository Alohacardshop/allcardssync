-- Region-based access control system
-- Step 1: Create regions table
CREATE TABLE IF NOT EXISTS public.regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial regions
INSERT INTO public.regions (id, name, description) VALUES
  ('las_vegas', 'Las Vegas', 'Las Vegas region including all Nevada stores'),
  ('hawaii', 'Hawaii', 'Hawaii region including all island stores')
ON CONFLICT (id) DO NOTHING;

-- Step 2: Add region_id to shopify_stores
ALTER TABLE public.shopify_stores 
ADD COLUMN IF NOT EXISTS region_id TEXT REFERENCES public.regions(id);

-- Step 3: Add region_id to user_shopify_assignments
ALTER TABLE public.user_shopify_assignments
ADD COLUMN IF NOT EXISTS region_id TEXT REFERENCES public.regions(id);

-- Step 4: Create unique index to enforce one region per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_single_region 
ON public.user_shopify_assignments (user_id, region_id);

-- Step 5: Create trigger to enforce single region per user
CREATE OR REPLACE FUNCTION public.check_user_single_region()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins to bypass this check
  IF public.has_role(NEW.user_id, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Check if user already has assignments in a different region
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

DROP TRIGGER IF EXISTS enforce_single_region ON public.user_shopify_assignments;
CREATE TRIGGER enforce_single_region
BEFORE INSERT OR UPDATE ON public.user_shopify_assignments
FOR EACH ROW EXECUTE FUNCTION public.check_user_single_region();

-- Step 6: Create region access function
CREATE OR REPLACE FUNCTION public.user_can_access_region(
  _user_id UUID,
  _region_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.user_shopify_assignments usa
      WHERE usa.user_id = _user_id 
      AND usa.region_id = _region_id
    )
  END;
$$;

-- Step 7: Enable RLS on regions table
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their assigned region" ON public.regions;
DROP POLICY IF EXISTS "Admins can manage regions" ON public.regions;
DROP POLICY IF EXISTS "Users can view stores in their region" ON public.shopify_stores;

-- Create RLS policies for regions
CREATE POLICY "Users can view their assigned region"
ON public.regions FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.user_can_access_region(auth.uid(), id)
);

CREATE POLICY "Admins can manage regions"
ON public.regions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Update shopify_stores RLS to include region check
CREATE POLICY "Users can view stores in their region"
ON public.shopify_stores FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    region_id IS NOT NULL AND region_id IN (
      SELECT region_id FROM public.user_shopify_assignments
      WHERE user_id = auth.uid()
    )
  )
  OR (
    -- Also allow if user has direct store assignment (backward compatibility)
    EXISTS (
      SELECT 1 FROM public.user_shopify_assignments
      WHERE user_id = auth.uid() AND store_key = shopify_stores.key
    )
  )
);