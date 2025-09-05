-- Fix Security Warnings from Supabase Linter

-- 1. Fix Trading Card Game Data Exposed to Public
-- Remove the public read access policy for games table and restrict to staff/admin only
DROP POLICY IF EXISTS "Public read access" ON public.games;

-- Ensure there's a proper staff/admin read policy
CREATE POLICY "Staff/Admin can view games" 
ON public.games 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Fix Function Search Path Mutable
-- Add SET search_path to functions that don't have it properly set

-- Fix send_intake_item_to_inventory function
CREATE OR REPLACE FUNCTION public.send_intake_item_to_inventory(item_id uuid)
RETURNS intake_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
declare
  v_row public.intake_items%rowtype;
begin
  update public.intake_items
     set processing_notes = coalesce(processing_notes,''),
         removed_from_batch_at = now(),
         price = coalesce(price, 0),
         updated_at = now()
   where id = item_id
   returning * into v_row;

  if not found then
    raise exception 'Item not found or you do not have access';
  end if;

  return v_row;
end;
$function$;

-- Fix create_raw_intake_item function
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(store_key_in text, shopify_location_gid_in text, quantity_in integer, brand_title_in text, subject_in text, category_in text, variant_in text, card_number_in text, grade_in text, price_in numeric, cost_in numeric, sku_in text, source_provider_in text DEFAULT 'manual'::text, catalog_snapshot_in jsonb DEFAULT NULL::jsonb, pricing_snapshot_in jsonb DEFAULT NULL::jsonb, processing_notes_in text DEFAULT NULL::text)
RETURNS TABLE(id uuid, lot_number text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_item_id uuid;
  v_lot_number text;
  v_created_at timestamp with time zone;
BEGIN
  -- Insert the intake item with minimal required fields
  INSERT INTO public.intake_items (
    store_key,
    shopify_location_gid,
    quantity,
    brand_title,
    subject,
    category,
    variant,
    card_number,
    grade,
    price,
    cost,
    sku,
    source_provider,
    catalog_snapshot,
    pricing_snapshot,
    processing_notes,
    unique_item_uid
  )
  VALUES (
    store_key_in,
    shopify_location_gid_in,
    COALESCE(quantity_in, 1),
    brand_title_in,
    subject_in,
    category_in,
    variant_in,
    card_number_in,
    grade_in,
    COALESCE(price_in, 0),
    cost_in,
    sku_in,
    COALESCE(source_provider_in, 'manual'),
    catalog_snapshot_in,
    pricing_snapshot_in,
    processing_notes_in,
    gen_random_uuid()
  )
  RETURNING intake_items.id, intake_items.lot_number, intake_items.created_at
  INTO v_item_id, v_lot_number, v_created_at;

  -- Return the minimal response
  RETURN QUERY SELECT v_item_id, v_lot_number, v_created_at;
END;
$function$;

-- Fix soft_delete_intake_item function
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(item_id uuid, reason_in text DEFAULT 'soft delete'::text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
begin
  update public.intake_items
     set deleted_at = now(),
         deleted_reason = reason_in,
         updated_at = now()
   where id = soft_delete_intake_item.item_id
   returning intake_items.id into id;

  if not found then
    raise exception 'Item not found or access denied';
  end if;

  insert into public.audit_log(action, table_name, record_id, new_data)
  values (
    'soft_delete',
    'intake_items',
    item_id::text,
    jsonb_build_object('reason', reason_in, 'at', now())
  );

  return next;
end;
$function$;

-- Fix restore_intake_item function
CREATE OR REPLACE FUNCTION public.restore_intake_item(item_id uuid, reason_in text DEFAULT 'restore'::text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
begin
  update public.intake_items
     set deleted_at = null,
         deleted_reason = null,
         updated_at = now()
   where id = restore_intake_item.item_id
   returning intake_items.id into id;

  if not found then
    raise exception 'Item not found or access denied';
  end if;

  insert into public.audit_log(action, table_name, record_id, new_data)
  values (
    'restore',
    'intake_items',
    item_id::text,
    jsonb_build_object('reason', reason_in, 'at', now())
  );

  return next;
end;
$function$;

-- Fix soft_delete_intake_items function
CREATE OR REPLACE FUNCTION public.soft_delete_intake_items(ids uuid[], reason text DEFAULT 'bulk soft delete'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
declare
  v_count int;
begin
  update public.intake_items
     set deleted_at = now(),
         deleted_reason = reason,
         updated_at = now()
   where id = any(ids);

  get diagnostics v_count = row_count;

  insert into public.audit_log(action, table_name, record_id, new_data)
  select
    'soft_delete_bulk',
    'intake_items',
    x::text,
    jsonb_build_object('reason', reason, 'at', now())
  from unnest(ids) as x;

  return jsonb_build_object('deleted_count', v_count);
end;
$function$;

-- Fix set_user_default_location function
CREATE OR REPLACE FUNCTION public.set_user_default_location(_store_key text, _location_gid text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
begin
  -- Ensure an assignment exists for this user/store/location; create it if missing
  insert into public.user_shopify_assignments (user_id, store_key, location_gid)
  values (auth.uid(), _store_key, _location_gid)
  on conflict (user_id, store_key, location_gid) do nothing;

  -- Unset any previous defaults for this user
  update public.user_shopify_assignments
     set is_default = false,
         updated_at = now()
   where user_id = auth.uid()
     and is_default = true;

  -- Set the new default for this user
  update public.user_shopify_assignments
     set is_default = true,
         updated_at = now()
   where user_id = auth.uid()
     and store_key = _store_key
     and location_gid = _location_gid;
end;
$function$;

-- Fix admin_delete_batch function
CREATE OR REPLACE FUNCTION public.admin_delete_batch(lot_id_in uuid, reason_in text DEFAULT 'Batch deleted by admin'::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
declare
  v_items integer := 0;
begin
  -- Require admin role
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Access denied: Admin role required';
  end if;

  -- Soft-delete items in the batch
  update public.intake_items
     set deleted_at = now(),
         deleted_reason = coalesce(reason_in, 'Batch deleted by admin'),
         updated_at = now()
   where lot_id = lot_id_in
     and deleted_at is null;

  get diagnostics v_items = row_count;

  -- Mark lot as deleted and zero totals
  update public.intake_lots
     set status = 'deleted',
         notes = coalesce(notes, '') ||
                 case when notes is null or notes = '' then '' else E'\n' end ||
                 ('Deleted at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') ||
                  ' by admin' ||
                  case when reason_in is not null and length(reason_in) > 0
                       then ': ' || reason_in else '' end),
         total_items = 0,
         total_value = 0,
         updated_at = now()
   where id = lot_id_in;

  return v_items;
end;
$function$;

-- 3. Move pg_trgm extension from public schema to extensions schema
-- Note: This requires careful handling as it affects existing indexes
-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_trgm extension to extensions schema (if possible)
-- Note: This might require dropping and recreating dependent objects
-- For now, we'll document this issue and suggest manual intervention

-- Add comment documenting the extension issue
COMMENT ON EXTENSION pg_trgm IS 'WARNING: This extension is in public schema. Consider moving to extensions schema for better security isolation.';