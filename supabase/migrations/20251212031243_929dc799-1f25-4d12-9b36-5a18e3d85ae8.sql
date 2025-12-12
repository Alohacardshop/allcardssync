-- Fix functions without explicit search_path set
-- This prevents potential security issues with unqualified object references

-- Fix get_distinct_categories
CREATE OR REPLACE FUNCTION public.get_distinct_categories()
RETURNS TABLE(category text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT unnest(ARRAY[main_category, category, sub_category]) AS category
  FROM public.intake_items
  WHERE deleted_at IS NULL
    AND (main_category IS NOT NULL OR category IS NOT NULL OR sub_category IS NOT NULL)
  ORDER BY category;
$$;

-- Fix safe_set_updated_by
CREATE OR REPLACE FUNCTION public.safe_set_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Fix trigger_shopify_sync
CREATE OR REPLACE FUNCTION public.trigger_shopify_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Enqueue the item for Shopify sync when relevant fields change
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.price IS DISTINCT FROM NEW.price) OR
       (OLD.quantity IS DISTINCT FROM NEW.quantity) OR
       (OLD.subject IS DISTINCT FROM NEW.subject) OR
       (OLD.grade IS DISTINCT FROM NEW.grade) THEN
      
      INSERT INTO public.shopify_sync_queue (inventory_item_id, action, status)
      VALUES (NEW.id, 'update', 'queued')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Fix update_alt_items_updated_at
CREATE OR REPLACE FUNCTION public.update_alt_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix update_purchase_locations_updated_at
CREATE OR REPLACE FUNCTION public.update_purchase_locations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix update_shopify_sync_queue_updated_at
CREATE OR REPLACE FUNCTION public.update_shopify_sync_queue_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;