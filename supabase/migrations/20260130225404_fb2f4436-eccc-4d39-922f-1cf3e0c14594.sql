-- =============================================
-- 1-of-1 Inventory Sync System
-- Core rule: SKU = 1 physical card, qty=1 at exactly ONE location
-- =============================================

-- Create enum types for status values
CREATE TYPE card_status AS ENUM ('available', 'reserved', 'sold');
CREATE TYPE sale_event_status AS ENUM ('received', 'processed', 'ignored', 'failed');
CREATE TYPE sale_source AS ENUM ('shopify', 'ebay');

-- =============================================
-- 1) cards table
-- =============================================
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  status card_status NOT NULL DEFAULT 'available',
  shopify_inventory_item_id TEXT,
  shopify_variant_id TEXT,
  current_shopify_location_id TEXT,  -- the single location that owns qty=1
  ebay_offer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_shopify_variant ON cards(shopify_variant_id);
CREATE INDEX idx_cards_current_location ON cards(current_shopify_location_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_updated_at_trigger
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION update_cards_updated_at();

-- =============================================
-- 2) sales_events table (idempotency log)
-- =============================================
CREATE TABLE sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source sale_source NOT NULL,
  source_event_id TEXT NOT NULL UNIQUE,  -- idempotency key
  sku TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status sale_event_status NOT NULL DEFAULT 'received',
  error TEXT
);

-- Indexes for quick lookups
CREATE INDEX idx_sales_events_sku ON sales_events(sku);
CREATE INDEX idx_sales_events_status ON sales_events(status);
CREATE INDEX idx_sales_events_source ON sales_events(source);
CREATE INDEX idx_sales_events_created ON sales_events(created_at DESC);

-- =============================================
-- 3) Atomic sale locking function
-- Tries to mark card as sold if available
-- Returns: 'sold' | 'already_sold' | 'not_found'
-- =============================================
CREATE OR REPLACE FUNCTION atomic_mark_card_sold(
  p_sku TEXT,
  p_source sale_source,
  p_source_event_id TEXT
)
RETURNS TABLE (
  result TEXT,
  card_id UUID,
  previous_status card_status
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_existing_event RECORD;
BEGIN
  -- Check for duplicate event (idempotency)
  SELECT * INTO v_existing_event 
  FROM sales_events 
  WHERE source_event_id = p_source_event_id;
  
  IF FOUND THEN
    -- Already processed this event
    RETURN QUERY SELECT 
      'duplicate_event'::TEXT, 
      NULL::UUID, 
      NULL::card_status;
    RETURN;
  END IF;

  -- Try to atomically update the card to 'sold'
  UPDATE cards 
  SET status = 'sold'
  WHERE sku = p_sku AND status = 'available'
  RETURNING id, status INTO v_card;
  
  IF NOT FOUND THEN
    -- Check if card exists but is already sold/reserved
    SELECT id, status INTO v_card FROM cards WHERE sku = p_sku;
    
    IF NOT FOUND THEN
      -- Log failed event
      INSERT INTO sales_events (source, source_event_id, sku, status, error)
      VALUES (p_source, p_source_event_id, p_sku, 'failed', 'Card not found');
      
      RETURN QUERY SELECT 
        'not_found'::TEXT, 
        NULL::UUID, 
        NULL::card_status;
      RETURN;
    ELSE
      -- Card exists but already sold/reserved - this is idempotent success
      INSERT INTO sales_events (source, source_event_id, sku, status, processed_at)
      VALUES (p_source, p_source_event_id, p_sku, 'ignored', now());
      
      RETURN QUERY SELECT 
        'already_sold'::TEXT, 
        v_card.id, 
        v_card.status;
      RETURN;
    END IF;
  END IF;
  
  -- Successfully marked as sold - log the event
  INSERT INTO sales_events (source, source_event_id, sku, status, processed_at)
  VALUES (p_source, p_source_event_id, p_sku, 'processed', now());
  
  RETURN QUERY SELECT 
    'sold'::TEXT, 
    v_card.id, 
    'available'::card_status;  -- previous status was 'available'
END;
$$;

-- =============================================
-- 4) Helper function to reserve a card
-- =============================================
CREATE OR REPLACE FUNCTION atomic_reserve_card(p_sku TEXT)
RETURNS TABLE (
  result TEXT,
  card_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
BEGIN
  UPDATE cards 
  SET status = 'reserved'
  WHERE sku = p_sku AND status = 'available'
  RETURNING id INTO v_card;
  
  IF NOT FOUND THEN
    SELECT id, status INTO v_card FROM cards WHERE sku = p_sku;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID;
    ELSE
      RETURN QUERY SELECT 'unavailable'::TEXT, v_card.id;
    END IF;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 'reserved'::TEXT, v_card.id;
END;
$$;

-- =============================================
-- 5) Helper function to release reservation
-- =============================================
CREATE OR REPLACE FUNCTION atomic_release_card(p_sku TEXT)
RETURNS TABLE (
  result TEXT,
  card_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
BEGIN
  UPDATE cards 
  SET status = 'available'
  WHERE sku = p_sku AND status = 'reserved'
  RETURNING id INTO v_card;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_reserved'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 'released'::TEXT, v_card.id;
END;
$$;

-- =============================================
-- 6) RLS Policies
-- =============================================
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_events ENABLE ROW LEVEL SECURITY;

-- Cards: Staff/Admin can manage
CREATE POLICY "Staff can view cards"
  ON cards FOR SELECT
  USING (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can insert cards"
  ON cards FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can update cards"
  ON cards FOR UPDATE
  USING (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete cards"
  ON cards FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Sales events: Staff can view, system inserts via functions
CREATE POLICY "Staff can view sales_events"
  ON sales_events FOR SELECT
  USING (has_role(auth.uid(), 'staff') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage sales_events"
  ON sales_events FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- 7) Comments for documentation
-- =============================================
COMMENT ON TABLE cards IS '1-of-1 inventory cards. Each SKU represents exactly one physical card.';
COMMENT ON COLUMN cards.current_shopify_location_id IS 'The single Shopify location that has qty=1 for this card. All other locations must have qty=0.';
COMMENT ON TABLE sales_events IS 'Idempotent log of sale events from Shopify/eBay webhooks.';
COMMENT ON COLUMN sales_events.source_event_id IS 'Unique event ID from source system for idempotency.';
COMMENT ON FUNCTION atomic_mark_card_sold IS 'Atomically marks a card as sold if available. Returns result status for idempotent handling.';