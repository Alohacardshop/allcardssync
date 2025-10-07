-- Create location_transfers table for bulk transfer audit logging
CREATE TABLE public.location_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  store_key text NOT NULL,
  source_location_gid text NOT NULL,
  destination_location_gid text NOT NULL,
  total_items integer NOT NULL DEFAULT 0,
  successful_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  completed_at timestamptz,
  error_details jsonb
);

-- Create location_transfer_items table for individual item tracking
CREATE TABLE public.location_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.location_transfers(id) ON DELETE CASCADE,
  intake_item_id uuid NOT NULL REFERENCES public.intake_items(id),
  sku text NOT NULL,
  barcode text,
  item_name text,
  quantity integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  shopify_product_id text,
  shopify_variant_id text,
  error_message text,
  processed_at timestamptz
);

-- Create indexes for performance
CREATE INDEX idx_location_transfers_store ON public.location_transfers(store_key);
CREATE INDEX idx_location_transfers_status ON public.location_transfers(status);
CREATE INDEX idx_location_transfers_created_by ON public.location_transfers(created_by);
CREATE INDEX idx_transfer_items_transfer ON public.location_transfer_items(transfer_id);
CREATE INDEX idx_transfer_items_intake ON public.location_transfer_items(intake_item_id);

-- Enable RLS
ALTER TABLE public.location_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_transfer_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for location_transfers
CREATE POLICY "Staff can view transfers for accessible stores"
ON public.location_transfers
FOR SELECT
USING (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
    OR user_can_access_store_location(auth.uid(), store_key, source_location_gid)
  )
);

CREATE POLICY "Staff can create transfers for accessible stores"
ON public.location_transfers
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND user_can_access_store_location(auth.uid(), store_key, source_location_gid)
  AND user_can_access_store_location(auth.uid(), store_key, destination_location_gid)
);

CREATE POLICY "Staff can update their transfers"
ON public.location_transfers
FOR UPDATE
USING (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid())
);

-- RLS Policies for location_transfer_items
CREATE POLICY "Staff can view transfer items"
ON public.location_transfer_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.location_transfers lt
    WHERE lt.id = location_transfer_items.transfer_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR lt.created_by = auth.uid()
      OR user_can_access_store_location(auth.uid(), lt.store_key, lt.source_location_gid)
    )
  )
);

CREATE POLICY "System can manage transfer items"
ON public.location_transfer_items
FOR ALL
USING (true)
WITH CHECK (true);