-- Fix Security Warnings - Clean approach

-- 1. Fix Trading Card Game Data Exposed to Public
-- Remove the public read access policy for games table
DROP POLICY IF EXISTS "Public read access" ON public.games;

-- Clean up duplicate policies - keep only the consolidated ones
DROP POLICY IF EXISTS "Staff can view games" ON public.games;

-- Ensure the comprehensive policy exists (it should already exist)
DO $$ 
BEGIN
    -- Only create if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'games' 
        AND policyname = 'Staff/Admin can view games'
    ) THEN
        EXECUTE 'CREATE POLICY "Staff/Admin can view games" ON public.games FOR SELECT USING (has_role(auth.uid(), ''staff''::app_role) OR has_role(auth.uid(), ''admin''::app_role))';
    END IF;
END $$;

-- 2. Fix Function Search Path Mutable issues
-- Update functions that don't have proper search_path set

CREATE OR REPLACE FUNCTION public.set_intake_price_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
begin
  if new.price is null then
    new.price := 99999.00;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_lot_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Check if a lot record exists for this lot_number
  IF NOT EXISTS (
    SELECT 1 FROM public.intake_lots 
    WHERE lot_number = NEW.lot_number
  ) THEN
    -- Create a new lot record
    INSERT INTO public.intake_lots (
      id,
      lot_number,
      lot_type,
      total_items,
      total_value,
      status,
      store_key,
      shopify_location_gid,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      NEW.lot_number,
      'mixed',
      0,  -- Will be updated by update_lot_totals trigger
      0,  -- Will be updated by update_lot_totals trigger
      'active',
      NEW.store_key,
      NEW.shopify_location_gid,
      auth.uid(),
      now(),
      now()
    );
  END IF;
  
  -- Set the lot_id if it's not already set
  IF NEW.lot_id IS NULL THEN
    NEW.lot_id := (
      SELECT id FROM public.intake_lots 
      WHERE lot_number = NEW.lot_number
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_lot_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_intake_item_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Create snapshot on INSERT, UPDATE, or DELETE
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.item_snapshots (
      intake_item_id,
      snapshot_type,
      snapshot_data,
      created_by,
      metadata
    ) VALUES (
      OLD.id,
      'deleted',
      to_jsonb(OLD),
      auth.uid(),
      jsonb_build_object('deleted_at', now(), 'deleted_reason', OLD.deleted_reason)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Create snapshot if significant fields changed
    IF (OLD.printed_at IS DISTINCT FROM NEW.printed_at) OR
       (OLD.pushed_at IS DISTINCT FROM NEW.pushed_at) OR  
       (OLD.price IS DISTINCT FROM NEW.price) OR
       (OLD.quantity IS DISTINCT FROM NEW.quantity) THEN
      
      INSERT INTO public.item_snapshots (
        intake_item_id,
        snapshot_type,
        snapshot_data,
        created_by,
        metadata
      ) VALUES (
        NEW.id,
        CASE 
          WHEN OLD.printed_at IS NULL AND NEW.printed_at IS NOT NULL THEN 'printed'
          WHEN OLD.pushed_at IS NULL AND NEW.pushed_at IS NOT NULL THEN 'pushed'
          ELSE 'updated'
        END,
        to_jsonb(NEW),
        auth.uid(),
        jsonb_build_object(
          'changes', jsonb_build_object(
            'printed_at', jsonb_build_object('old', OLD.printed_at, 'new', NEW.printed_at),
            'pushed_at', jsonb_build_object('old', OLD.pushed_at, 'new', NEW.pushed_at),
            'price', jsonb_build_object('old', OLD.price, 'new', NEW.price),
            'quantity', jsonb_build_object('old', OLD.quantity, 'new', NEW.quantity)
          )
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.item_snapshots (
      intake_item_id,
      snapshot_type,
      snapshot_data,
      created_by
    ) VALUES (
      NEW.id,
      'created',
      to_jsonb(NEW),
      auth.uid()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;