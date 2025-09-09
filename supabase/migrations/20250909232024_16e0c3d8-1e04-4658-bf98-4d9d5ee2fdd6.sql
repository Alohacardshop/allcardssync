-- A) Batches must be per-user

-- A1. Update existing function to be per-user only
CREATE OR REPLACE FUNCTION public.get_or_create_active_lot(_store_key text, _location_gid text)
 RETURNS TABLE(id uuid, lot_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_lot text;
BEGIN
  -- Find latest active lot for this user only (removed admin OR clause)
  SELECT l.id, l.lot_number
    INTO v_id, v_lot
  FROM public.intake_lots l
  WHERE l.status = 'active'
    AND COALESCE(l.store_key, '') = COALESCE(btrim(_store_key), '')
    AND COALESCE(public._norm_gid(l.shopify_location_gid), '') = COALESCE(public._norm_gid(_location_gid), '')
    AND l.created_by = auth.uid()  -- Only my lots now
  ORDER BY l.created_at DESC
  LIMIT 1;

  -- If none, create a new one
  IF v_id IS NULL THEN
    INSERT INTO public.intake_lots (
      store_key, shopify_location_gid, lot_type, total_items, total_value, status, created_by, created_at, updated_at
    )
    VALUES (
      btrim(_store_key), btrim(_location_gid), 'mixed', 0, 0, 'active', auth.uid(), now(), now()
    )
    RETURNING intake_lots.id, intake_lots.lot_number INTO v_id, v_lot;
  END IF;

  RETURN QUERY SELECT v_id, v_lot;
END;
$function$;

-- A2. Add admin "on behalf of" function
CREATE OR REPLACE FUNCTION public.get_or_create_active_lot_for_user(
  _store_key text, 
  _location_gid text, 
  _user_id uuid
) 
RETURNS public.intake_lots 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public' 
AS $$
DECLARE 
  v_lot public.intake_lots;
BEGIN
  -- Admin only
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- Find existing active lot for target user
  SELECT * INTO v_lot
  FROM public.intake_lots l
  WHERE l.status = 'active'
    AND COALESCE(l.store_key, '') = COALESCE(btrim(_store_key), '')
    AND COALESCE(public._norm_gid(l.shopify_location_gid), '') = COALESCE(public._norm_gid(_location_gid), '')
    AND l.created_by = _user_id
  ORDER BY l.created_at DESC
  LIMIT 1;

  -- Create if none exists
  IF v_lot.id IS NULL THEN
    INSERT INTO public.intake_lots (
      store_key, shopify_location_gid, lot_type, total_items, total_value, status, created_by, created_at, updated_at
    )
    VALUES (
      btrim(_store_key), btrim(_location_gid), 'mixed', 0, 0, 'active', _user_id, now(), now()
    )
    RETURNING * INTO v_lot;
  END IF;

  RETURN v_lot;
END;
$$;

-- A3. Backfill null owners and add uniqueness constraint
-- Claim legacy active lots with null owners to the most recent item's creator
UPDATE public.intake_lots l
SET created_by = i.created_by, updated_at = now()
FROM (
  SELECT lot_id, (array_agg(created_by ORDER BY created_at DESC))[1] AS created_by
  FROM public.intake_items
  WHERE lot_id IS NOT NULL AND created_by IS NOT NULL
  GROUP BY lot_id
) i
WHERE l.id = i.lot_id 
  AND l.status = 'active' 
  AND l.created_by IS NULL;

-- One active lot per (user, store, location)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_lot_per_user_store_loc
ON public.intake_lots (created_by, store_key, public._norm_gid(shopify_location_gid))
WHERE status = 'active' AND created_by IS NOT NULL;

-- A4. Update RLS policies - remove created_by IS NULL fallbacks
DROP POLICY IF EXISTS "Users can view intake_lots they have access to" ON public.intake_lots;
CREATE POLICY "Users can view intake_lots they have access to" 
ON public.intake_lots FOR SELECT
USING (
  ((store_key IS NULL) OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)) 
  AND (has_role(auth.uid(), 'admin'::app_role) OR (created_by = auth.uid()))
);

DROP POLICY IF EXISTS "Staff can update intake_lots they have access to" ON public.intake_lots;
CREATE POLICY "Staff can update intake_lots they have access to" 
ON public.intake_lots FOR UPDATE
USING (
  ((has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) 
  AND ((store_key IS NULL) OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)) 
  AND (has_role(auth.uid(), 'admin'::app_role) OR (created_by = auth.uid())))
);

-- A5. Safety constraint
ALTER TABLE public.intake_items
  ADD CONSTRAINT fk_item_lot_same_owner
  CHECK (
    lot_id IS NULL OR
    created_by = (SELECT created_by FROM public.intake_lots WHERE id = lot_id)
  ) NOT VALID;

-- Validate the constraint
ALTER TABLE public.intake_items VALIDATE CONSTRAINT fk_item_lot_same_owner;

-- C1. Ensure INVENTORY_SYNC_MODE defaults to 'auto'
INSERT INTO public.system_settings (key_name, key_value, description, category)
VALUES (
  'INVENTORY_SYNC_MODE', 
  'auto', 
  'Controls automatic inventory synchronization with Shopify (auto/manual)', 
  'shopify'
)
ON CONFLICT (key_name) DO NOTHING;

-- E1. Add sales fields to intake_items (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intake_items' AND column_name='sold_at') THEN
    ALTER TABLE public.intake_items ADD COLUMN sold_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intake_items' AND column_name='sold_price') THEN
    ALTER TABLE public.intake_items ADD COLUMN sold_price NUMERIC(10,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intake_items' AND column_name='sold_currency') THEN
    ALTER TABLE public.intake_items ADD COLUMN sold_currency TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intake_items' AND column_name='sold_order_id') THEN
    ALTER TABLE public.intake_items ADD COLUMN sold_order_id TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='intake_items' AND column_name='sold_channel') THEN
    ALTER TABLE public.intake_items ADD COLUMN sold_channel TEXT;
  END IF;
END $$;

-- E2. Create webhook events table for idempotency
CREATE TABLE IF NOT EXISTS public.webhook_events (
  webhook_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage webhook events
CREATE POLICY "Admins can manage webhook_events" 
ON public.webhook_events FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));