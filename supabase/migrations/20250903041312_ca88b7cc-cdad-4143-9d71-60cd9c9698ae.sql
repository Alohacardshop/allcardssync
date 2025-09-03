
-- 1) Create RPC to send a single intake item to inventory (safe, RLS-respecting)
create or replace function public.send_intake_item_to_inventory(item_id uuid)
returns public.intake_items
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

-- 2) Create RPC to soft-delete a single intake item (safe, RLS-respecting)
create or replace function public.soft_delete_intake_item(item_id uuid, reason_in text default 'Deleted from current batch')
returns public.intake_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.intake_items%rowtype;
begin
  update public.intake_items
     set deleted_at = now(),
         deleted_reason = coalesce(reason_in, 'Deleted from current batch'),
         updated_at = now()
   where id = item_id
   returning * into v_row;

  if not found then
    raise exception 'Item not found or you do not have access';
  end if;

  return v_row;
end;
$$;

-- 3) Harden lot totals trigger function to avoid NULL arithmetic
create or replace function public.update_lot_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update lot totals when items are added/removed/changed with null-safe arithmetic
  if tg_op = 'DELETE' then
    update public.intake_lots 
       set total_items = coalesce(total_items, 0) - coalesce(old.quantity, 0),
           total_value = coalesce(total_value, 0) - (coalesce(old.price, 0) * coalesce(old.quantity, 0)),
           updated_at = now()
     where id = old.lot_id;
    return old;

  elsif tg_op = 'UPDATE' then
    -- Handle lot change
    if old.lot_id is distinct from new.lot_id then
      -- Remove from old lot
      if old.lot_id is not null then
        update public.intake_lots 
           set total_items = coalesce(total_items, 0) - coalesce(old.quantity, 0),
               total_value = coalesce(total_value, 0) - (coalesce(old.price, 0) * coalesce(old.quantity, 0)),
               updated_at = now()
         where id = old.lot_id;
      end if;

      -- Add to new lot  
      if new.lot_id is not null then
        update public.intake_lots 
           set total_items = coalesce(total_items, 0) + coalesce(new.quantity, 0),
               total_value = coalesce(total_value, 0) + (coalesce(new.price, 0) * coalesce(new.quantity, 0)),
               updated_at = now()
         where id = new.lot_id;
      end if;

    else
      -- Update existing lot totals
      if new.lot_id is not null then
        update public.intake_lots 
           set total_items = coalesce(total_items, 0) - coalesce(old.quantity, 0) + coalesce(new.quantity, 0),
               total_value = coalesce(total_value, 0)
                             - (coalesce(old.price, 0) * coalesce(old.quantity, 0))
                             + (coalesce(new.price, 0) * coalesce(new.quantity, 0)),
               updated_at = now()
         where id = new.lot_id;
      end if;
    end if;

    return new;

  elsif tg_op = 'INSERT' then
    if new.lot_id is not null then
      update public.intake_lots 
         set total_items = coalesce(total_items, 0) + coalesce(new.quantity, 0),
             total_value = coalesce(total_value, 0) + (coalesce(new.price, 0) * coalesce(new.quantity, 0)),
             updated_at = now()
       where id = new.lot_id;
    end if;
    return new;
  end if;

  return null;
end;
$$;

-- 4) Make Shopify inventory sync non-blocking and exception-safe (use async + catch)
create or replace function public.trigger_shopify_inventory_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sync_payload jsonb;
begin
  if tg_op = 'DELETE' then
    if old.sku is not null and old.store_key is not null then
      sync_payload := jsonb_build_object(
        'storeKey', old.store_key,
        'sku', old.sku,
        'locationGid', old.shopify_location_gid
      );
      begin
        perform public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := sync_payload
        );
      exception when others then
        -- Do not block the main transaction on network errors
        raise notice 'Shopify sync dispatch failed (DELETE): %', SQLERRM;
      end;
    end if;
    return old;

  else
    if new.sku is not null and new.store_key is not null and (
      tg_op = 'INSERT' or
      old.sku is distinct from new.sku or
      old.quantity is distinct from new.quantity or
      old.deleted_at is distinct from new.deleted_at or
      old.removed_from_batch_at is distinct from new.removed_from_batch_at or
      old.store_key is distinct from new.store_key or
      old.shopify_location_gid is distinct from new.shopify_location_gid
    ) then

      -- Sync the new SKU
      sync_payload := jsonb_build_object(
        'storeKey', new.store_key,
        'sku', new.sku,
        'locationGid', new.shopify_location_gid
      );
      begin
        perform public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := sync_payload
        );
      exception when others then
        raise notice 'Shopify sync dispatch failed (UPSERT new): %', SQLERRM;
      end;

      -- If SKU changed on UPDATE, also sync the old SKU
      if tg_op = 'UPDATE' and old.sku is distinct from new.sku and old.sku is not null then
        sync_payload := jsonb_build_object(
          'storeKey', old.store_key,
          'sku', old.sku,
          'locationGid', old.shopify_location_gid
        );
        begin
          perform public.http_post_async(
            url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body    := sync_payload
          );
        exception when others then
          raise notice 'Shopify sync dispatch failed (UPSERT old sku): %', SQLERRM;
        end;
      end if;
    end if;

    return new;
  end if;
end;
$$;
