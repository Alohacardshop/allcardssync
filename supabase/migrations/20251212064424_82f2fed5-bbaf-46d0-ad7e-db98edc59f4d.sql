
-- Phase 1: eBay Multi-Location Sync - Testing-First Setup

-- 1. Add sync control columns to ebay_store_config
ALTER TABLE public.ebay_store_config
ADD COLUMN IF NOT EXISTS sync_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS dry_run_mode boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_mode text DEFAULT 'manual' CHECK (sync_mode IN ('manual', 'realtime'));

-- 2. Create ebay_location_priority table for waterfall fulfillment
CREATE TABLE IF NOT EXISTS public.ebay_location_priority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL,
  shopify_location_gid text NOT NULL,
  location_name text,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_key, shopify_location_gid)
);

-- Enable RLS
ALTER TABLE public.ebay_location_priority ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage ebay_location_priority"
  ON public.ebay_location_priority FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_location_priority"
  ON public.ebay_location_priority FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 3. Create ebay_inventory_aggregate table for tracking aggregated quantities
CREATE TABLE IF NOT EXISTS public.ebay_inventory_aggregate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL,
  sku text NOT NULL,
  total_quantity integer NOT NULL DEFAULT 0,
  location_quantities jsonb DEFAULT '{}',
  last_synced_to_ebay_at timestamptz,
  ebay_quantity integer,
  needs_sync boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_key, sku)
);

-- Enable RLS
ALTER TABLE public.ebay_inventory_aggregate ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage ebay_inventory_aggregate"
  ON public.ebay_inventory_aggregate FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_inventory_aggregate"
  ON public.ebay_inventory_aggregate FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 4. Create ebay_sync_log for audit trail
CREATE TABLE IF NOT EXISTS public.ebay_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL,
  sku text,
  operation text NOT NULL,
  dry_run boolean DEFAULT true,
  before_state jsonb,
  after_state jsonb,
  ebay_response jsonb,
  success boolean,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.ebay_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage ebay_sync_log"
  ON public.ebay_sync_log FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_sync_log"
  ON public.ebay_sync_log FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 5. Create function to recalculate aggregate quantities
CREATE OR REPLACE FUNCTION public.recalculate_ebay_aggregate(
  p_sku text,
  p_store_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer := 0;
  v_location_qtys jsonb := '{}';
  v_current_ebay_qty integer;
  v_needs_sync boolean;
  rec record;
BEGIN
  -- Sum quantities per location
  FOR rec IN
    SELECT 
      shopify_location_gid,
      SUM(quantity) as qty
    FROM intake_items
    WHERE sku = p_sku
      AND store_key = p_store_key
      AND deleted_at IS NULL
      AND quantity > 0
    GROUP BY shopify_location_gid
  LOOP
    v_total := v_total + rec.qty;
    v_location_qtys := v_location_qtys || jsonb_build_object(rec.shopify_location_gid, rec.qty);
  END LOOP;

  -- Get current eBay quantity to check if sync needed
  SELECT ebay_quantity INTO v_current_ebay_qty
  FROM ebay_inventory_aggregate
  WHERE sku = p_sku AND store_key = p_store_key;

  v_needs_sync := (v_current_ebay_qty IS NULL OR v_current_ebay_qty != v_total);

  -- Upsert the aggregate
  INSERT INTO ebay_inventory_aggregate (store_key, sku, total_quantity, location_quantities, needs_sync, updated_at)
  VALUES (p_store_key, p_sku, v_total, v_location_qtys, v_needs_sync, now())
  ON CONFLICT (store_key, sku)
  DO UPDATE SET
    total_quantity = EXCLUDED.total_quantity,
    location_quantities = EXCLUDED.location_quantities,
    needs_sync = EXCLUDED.needs_sync,
    updated_at = now();

  RETURN jsonb_build_object(
    'sku', p_sku,
    'store_key', p_store_key,
    'total_quantity', v_total,
    'location_quantities', v_location_qtys,
    'needs_sync', v_needs_sync
  );
END;
$$;

-- 6. Create function for waterfall inventory decrement
CREATE OR REPLACE FUNCTION public.decrement_inventory_waterfall(
  p_sku text,
  p_store_key text,
  p_qty_to_remove integer,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining integer := p_qty_to_remove;
  v_decrements jsonb := '[]';
  v_before_state jsonb;
  v_after_state jsonb;
  rec record;
  v_decrement_qty integer;
  v_item record;
BEGIN
  -- Capture before state
  SELECT jsonb_agg(jsonb_build_object(
    'location_gid', shopify_location_gid,
    'quantity', quantity,
    'item_id', id
  ))
  INTO v_before_state
  FROM intake_items
  WHERE sku = p_sku AND store_key = p_store_key AND deleted_at IS NULL AND quantity > 0;

  -- Process locations in priority order
  FOR rec IN
    SELECT elp.shopify_location_gid, elp.priority
    FROM ebay_location_priority elp
    WHERE elp.store_key = p_store_key AND elp.is_active = true
    ORDER BY elp.priority ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    -- Find items at this location with available quantity
    FOR v_item IN
      SELECT id, quantity
      FROM intake_items
      WHERE sku = p_sku
        AND store_key = p_store_key
        AND shopify_location_gid = rec.shopify_location_gid
        AND deleted_at IS NULL
        AND quantity > 0
      ORDER BY created_at ASC
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_decrement_qty := LEAST(v_item.quantity, v_remaining);

      IF NOT p_dry_run THEN
        UPDATE intake_items
        SET quantity = quantity - v_decrement_qty,
            updated_at = now()
        WHERE id = v_item.id;
      END IF;

      v_decrements := v_decrements || jsonb_build_object(
        'item_id', v_item.id,
        'location_gid', rec.shopify_location_gid,
        'decremented', v_decrement_qty
      );

      v_remaining := v_remaining - v_decrement_qty;
    END LOOP;
  END LOOP;

  -- Capture after state (what it would be)
  IF p_dry_run THEN
    v_after_state := v_before_state; -- No actual change
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'location_gid', shopify_location_gid,
      'quantity', quantity,
      'item_id', id
    ))
    INTO v_after_state
    FROM intake_items
    WHERE sku = p_sku AND store_key = p_store_key AND deleted_at IS NULL;

    -- Recalculate aggregate after decrement
    PERFORM recalculate_ebay_aggregate(p_sku, p_store_key);
  END IF;

  -- Log the operation
  INSERT INTO ebay_sync_log (store_key, sku, operation, dry_run, before_state, after_state, success, created_by)
  VALUES (p_store_key, p_sku, 'waterfall_decrement', p_dry_run, v_before_state, 
          jsonb_build_object('decrements', v_decrements, 'unfulfilled', v_remaining),
          v_remaining = 0, auth.uid());

  RETURN jsonb_build_object(
    'success', v_remaining = 0,
    'requested', p_qty_to_remove,
    'fulfilled', p_qty_to_remove - v_remaining,
    'unfulfilled', v_remaining,
    'decrements', v_decrements,
    'dry_run', p_dry_run
  );
END;
$$;

-- 7. Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_ebay_location_priority_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';

CREATE TRIGGER update_ebay_location_priority_updated_at
  BEFORE UPDATE ON public.ebay_location_priority
  FOR EACH ROW EXECUTE FUNCTION update_ebay_location_priority_updated_at();

CREATE OR REPLACE FUNCTION public.update_ebay_inventory_aggregate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';

CREATE TRIGGER update_ebay_inventory_aggregate_updated_at
  BEFORE UPDATE ON public.ebay_inventory_aggregate
  FOR EACH ROW EXECUTE FUNCTION update_ebay_inventory_aggregate_updated_at();

-- 8. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ebay_inventory_aggregate_needs_sync 
  ON public.ebay_inventory_aggregate(store_key, needs_sync) WHERE needs_sync = true;

CREATE INDEX IF NOT EXISTS idx_ebay_location_priority_store 
  ON public.ebay_location_priority(store_key, priority);

CREATE INDEX IF NOT EXISTS idx_ebay_sync_log_store_created 
  ON public.ebay_sync_log(store_key, created_at DESC);
