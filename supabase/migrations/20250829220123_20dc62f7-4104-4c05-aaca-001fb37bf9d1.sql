-- Fix security warnings: Set proper search_path for functions
CREATE OR REPLACE FUNCTION public.create_intake_item_snapshot()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Fix security warnings: Set proper search_path for lot totals function
CREATE OR REPLACE FUNCTION public.update_lot_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update lot totals when items are added/removed/changed
  IF TG_OP = 'DELETE' THEN
    UPDATE public.intake_lots 
    SET 
      total_items = total_items - OLD.quantity,
      total_value = total_value - (OLD.price * OLD.quantity),
      updated_at = now()
    WHERE id = OLD.lot_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle lot change
    IF OLD.lot_id IS DISTINCT FROM NEW.lot_id THEN
      -- Remove from old lot
      IF OLD.lot_id IS NOT NULL THEN
        UPDATE public.intake_lots 
        SET 
          total_items = total_items - OLD.quantity,
          total_value = total_value - (OLD.price * OLD.quantity),
          updated_at = now()
        WHERE id = OLD.lot_id;
      END IF;
      -- Add to new lot  
      IF NEW.lot_id IS NOT NULL THEN
        UPDATE public.intake_lots 
        SET 
          total_items = total_items + NEW.quantity,
          total_value = total_value + (NEW.price * NEW.quantity),
          updated_at = now()
        WHERE id = NEW.lot_id;
      END IF;
    ELSE
      -- Update existing lot totals
      IF NEW.lot_id IS NOT NULL THEN
        UPDATE public.intake_lots 
        SET 
          total_items = total_items - OLD.quantity + NEW.quantity,
          total_value = total_value - (OLD.price * OLD.quantity) + (NEW.price * NEW.quantity),
          updated_at = now()
        WHERE id = NEW.lot_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.lot_id IS NOT NULL THEN
      UPDATE public.intake_lots 
      SET 
        total_items = total_items + NEW.quantity,
        total_value = total_value + (NEW.price * NEW.quantity),
        updated_at = now()
      WHERE id = NEW.lot_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';