-- Add store and location columns to intake_items
ALTER TABLE public.intake_items 
ADD COLUMN store_key text,
ADD COLUMN shopify_location_gid text;

-- Create function to check if user can access store/location
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
  -- Admins can access everything
  SELECT CASE 
    WHEN has_role(_user_id, 'admin'::app_role) THEN true
    -- For non-admins, check if they have assignment to this store/location
    WHEN _location_gid IS NULL THEN EXISTS (
      SELECT 1 FROM user_shopify_assignments usa
      WHERE usa.user_id = _user_id AND usa.store_key = _store_key
    )
    ELSE EXISTS (
      SELECT 1 FROM user_shopify_assignments usa  
      WHERE usa.user_id = _user_id 
        AND usa.store_key = _store_key 
        AND usa.location_gid = _location_gid
    )
  END;
$$;

-- Update RLS policy for intake_items to include store/location access
DROP POLICY IF EXISTS "Staff/Admin can view intake_items" ON public.intake_items;

CREATE POLICY "Users can view intake_items they have access to"
ON public.intake_items
FOR SELECT
TO authenticated
USING (
  store_key IS NULL OR 
  user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
);

DROP POLICY IF EXISTS "Staff/Admin can insert intake_items" ON public.intake_items;

CREATE POLICY "Users can insert intake_items to accessible locations" 
ON public.intake_items
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL OR 
    user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
  )
);

DROP POLICY IF EXISTS "Staff/Admin can update intake_items" ON public.intake_items;

CREATE POLICY "Users can update intake_items they have access to"
ON public.intake_items  
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL OR 
    user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL OR 
    user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
  )
);

-- Insert default stores if they don't exist
INSERT INTO public.shopify_stores (key, name, vendor, domain) 
VALUES 
  ('lasvegas', 'Las Vegas Store', 'Las Vegas', 'lasvegas-store.myshopify.com'),
  ('hawaii', 'Hawaii Store', 'Hawaii', 'hawaii-store.myshopify.com')
ON CONFLICT (key) DO NOTHING;