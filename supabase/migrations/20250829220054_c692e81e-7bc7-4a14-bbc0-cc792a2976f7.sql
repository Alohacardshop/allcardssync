-- Add comprehensive data capture fields to intake_items
ALTER TABLE public.intake_items 
ADD COLUMN source_provider text, -- 'psa', 'tcgplayer', 'manual', 'raw_search'
ADD COLUMN source_payload jsonb, -- Original import data (CSV row, search result, etc.)
ADD COLUMN grading_data jsonb, -- PSA cert details, condition assessment, etc.
ADD COLUMN catalog_snapshot jsonb, -- Card details from catalog at time of intake
ADD COLUMN pricing_snapshot jsonb, -- Market pricing data at time of intake  
ADD COLUMN label_snapshot jsonb, -- Generated label data and settings
ADD COLUMN shopify_snapshot jsonb, -- Shopify product/variant data when pushed
ADD COLUMN image_urls jsonb, -- Array of image URLs captured
ADD COLUMN processing_notes text, -- Any processing notes or issues
ADD COLUMN intake_batch_id uuid, -- Group related items together
ADD COLUMN original_filename text, -- For bulk imports, track source file
ADD COLUMN source_row_number integer; -- For bulk imports, track row number

-- Create intake_lots table for grouping items  
CREATE TABLE public.intake_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number text UNIQUE NOT NULL DEFAULT generate_lot_number(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  store_key text,
  shopify_location_gid text,
  lot_type text NOT NULL DEFAULT 'mixed', -- 'psa', 'raw', 'mixed'
  total_items integer DEFAULT 0,
  total_value numeric(10,2) DEFAULT 0,
  status text DEFAULT 'active', -- 'active', 'printed', 'shipped', 'completed'
  notes text,
  processing_data jsonb -- Any lot-level processing information
);

-- Create item_snapshots table for lifecycle tracking
CREATE TABLE public.item_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_item_id uuid NOT NULL REFERENCES public.intake_items(id) ON DELETE CASCADE,
  snapshot_type text NOT NULL, -- 'created', 'printed', 'pushed', 'updated', 'deleted'
  snapshot_data jsonb NOT NULL, -- Full item state at time of snapshot
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  metadata jsonb -- Additional context (print job info, shopify response, etc.)
);

-- Add lot relationship to intake_items
ALTER TABLE public.intake_items 
ADD COLUMN lot_id uuid REFERENCES public.intake_lots(id);

-- Enable RLS on new tables
ALTER TABLE public.intake_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies for intake_lots
CREATE POLICY "Users can view intake_lots they have access to"
ON public.intake_lots
FOR SELECT
TO authenticated
USING (
  store_key IS NULL OR 
  user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
);

CREATE POLICY "Staff can insert intake_lots to accessible locations" 
ON public.intake_lots
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL OR 
    user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
  )
);

CREATE POLICY "Staff can update intake_lots they have access to"
ON public.intake_lots  
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL OR 
    user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
  )
);

-- RLS policies for item_snapshots
CREATE POLICY "Users can view item_snapshots for accessible items"
ON public.item_snapshots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.intake_items ii 
    WHERE ii.id = intake_item_id 
    AND (ii.store_key IS NULL OR user_can_access_store_location(auth.uid(), ii.store_key, ii.shopify_location_gid))
  )
);

CREATE POLICY "Staff can insert item_snapshots for accessible items"
ON public.item_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.intake_items ii 
    WHERE ii.id = intake_item_id 
    AND (ii.store_key IS NULL OR user_can_access_store_location(auth.uid(), ii.store_key, ii.shopify_location_gid))
  )
);

-- Create audit trigger function for intake_items
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for intake_items
CREATE TRIGGER intake_item_snapshot_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.create_intake_item_snapshot();

-- Create trigger to update lot totals
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for lot totals
CREATE TRIGGER update_lot_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.update_lot_totals();

-- Add indexes for performance
CREATE INDEX idx_intake_items_source_provider ON public.intake_items(source_provider);
CREATE INDEX idx_intake_items_intake_batch_id ON public.intake_items(intake_batch_id);
CREATE INDEX idx_intake_items_lot_id ON public.intake_items(lot_id);
CREATE INDEX idx_item_snapshots_intake_item_id ON public.item_snapshots(intake_item_id);
CREATE INDEX idx_item_snapshots_snapshot_type ON public.item_snapshots(snapshot_type);
CREATE INDEX idx_item_snapshots_created_at ON public.item_snapshots(created_at);
CREATE INDEX idx_intake_lots_store_key ON public.intake_lots(store_key);
CREATE INDEX idx_intake_lots_status ON public.intake_lots(status);