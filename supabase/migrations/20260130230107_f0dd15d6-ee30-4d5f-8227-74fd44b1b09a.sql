-- =============================================
-- Production-Grade 1-of-1 Inventory Sync System
-- Phase 1: Tables and Helper Functions
-- =============================================

-- Job types for retry queue
CREATE TYPE retry_job_type AS ENUM (
  'END_EBAY',           -- End eBay listing (set qty=0)
  'SET_SHOPIFY_ZERO',   -- Set Shopify inventory to 0
  'ENFORCE_LOCATION'    -- Enforce single-location invariant
);

CREATE TYPE retry_job_status AS ENUM (
  'queued',
  'running', 
  'done',
  'dead'
);

-- Retry jobs table for reliable async operations
CREATE TABLE retry_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type retry_job_type NOT NULL,
  sku TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  next_run_at TIMESTAMPTZ DEFAULT now(),
  last_error TEXT,
  status retry_job_status NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient job processing
CREATE INDEX idx_retry_jobs_status_next_run 
  ON retry_jobs(status, next_run_at) 
  WHERE status = 'queued';
CREATE INDEX idx_retry_jobs_sku ON retry_jobs(sku);

-- Enable RLS
ALTER TABLE retry_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for retry_jobs
CREATE POLICY "Admins can manage retry_jobs"
  ON retry_jobs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view retry_jobs"
  ON retry_jobs FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Location drift flags table
CREATE TABLE location_drift_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  card_id UUID REFERENCES cards(id),
  drift_type TEXT NOT NULL CHECK (drift_type IN ('multi_location', 'no_location', 'location_mismatch')),
  expected_location_id TEXT,
  actual_locations JSONB,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  notes TEXT
);

-- Index for unresolved flags
CREATE INDEX idx_location_drift_unresolved 
  ON location_drift_flags(detected_at) 
  WHERE resolved_at IS NULL;
CREATE INDEX idx_location_drift_sku ON location_drift_flags(sku);

-- Enable RLS
ALTER TABLE location_drift_flags ENABLE ROW LEVEL SECURITY;

-- RLS policies for location_drift_flags
CREATE POLICY "Admins can manage location_drift_flags"
  ON location_drift_flags FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view location_drift_flags"
  ON location_drift_flags FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- Helper Functions
-- =============================================

-- Queue an eBay listing end job
CREATE OR REPLACE FUNCTION queue_ebay_end_listing(
  p_sku TEXT,
  p_ebay_offer_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO retry_jobs (job_type, sku, payload, status)
  VALUES ('END_EBAY'::retry_job_type, p_sku, jsonb_build_object(
    'ebay_offer_id', p_ebay_offer_id
  ), 'queued'::retry_job_status)
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- Queue a Shopify inventory zero job
CREATE OR REPLACE FUNCTION queue_shopify_zero(
  p_sku TEXT,
  p_inventory_item_id TEXT,
  p_location_id TEXT,
  p_store_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO retry_jobs (job_type, sku, payload, status)
  VALUES ('SET_SHOPIFY_ZERO'::retry_job_type, p_sku, jsonb_build_object(
    'inventory_item_id', p_inventory_item_id,
    'location_id', p_location_id,
    'store_key', p_store_key
  ), 'queued'::retry_job_status)
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- Queue a location enforcement job
CREATE OR REPLACE FUNCTION record_location_enforcement(
  p_sku TEXT,
  p_desired_location_id TEXT,
  p_store_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Update cards table with desired location
  UPDATE cards 
  SET current_shopify_location_id = p_desired_location_id,
      updated_at = now()
  WHERE sku = p_sku;
  
  -- Create enforcement job
  INSERT INTO retry_jobs (job_type, sku, payload, status)
  VALUES ('ENFORCE_LOCATION'::retry_job_type, p_sku, jsonb_build_object(
    'desired_location_id', p_desired_location_id,
    'store_key', p_store_key
  ), 'queued'::retry_job_status)
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- Claim jobs for processing (atomic claim with lock)
CREATE OR REPLACE FUNCTION claim_retry_jobs(
  p_limit INT DEFAULT 10,
  p_processor_id TEXT DEFAULT NULL
)
RETURNS SETOF retry_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE retry_jobs
  SET 
    status = 'running'::retry_job_status,
    attempts = attempts + 1,
    updated_at = now()
  WHERE id IN (
    SELECT id 
    FROM retry_jobs 
    WHERE status = 'queued' 
      AND next_run_at <= now()
    ORDER BY next_run_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Mark job as completed
CREATE OR REPLACE FUNCTION complete_retry_job(
  p_job_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE retry_jobs
  SET 
    status = 'done'::retry_job_status,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$;

-- Mark job as failed with exponential backoff
CREATE OR REPLACE FUNCTION fail_retry_job(
  p_job_id UUID,
  p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts INT;
  v_max_attempts INT;
  v_backoff_seconds INT;
BEGIN
  -- Get current attempts
  SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
  FROM retry_jobs WHERE id = p_job_id;
  
  IF v_attempts >= v_max_attempts THEN
    -- Mark as dead
    UPDATE retry_jobs
    SET 
      status = 'dead'::retry_job_status,
      last_error = p_error,
      updated_at = now()
    WHERE id = p_job_id;
  ELSE
    -- Exponential backoff: 30s, 60s, 120s, 240s, 480s
    v_backoff_seconds := (30 * power(2, v_attempts - 1))::INT + (random() * 30)::INT;
    
    UPDATE retry_jobs
    SET 
      status = 'queued'::retry_job_status,
      last_error = p_error,
      next_run_at = now() + (v_backoff_seconds || ' seconds')::INTERVAL,
      updated_at = now()
    WHERE id = p_job_id;
  END IF;
END;
$$;

-- Flag location drift
CREATE OR REPLACE FUNCTION flag_location_drift(
  p_sku TEXT,
  p_card_id UUID,
  p_drift_type TEXT,
  p_expected_location TEXT,
  p_actual_locations JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag_id UUID;
BEGIN
  INSERT INTO location_drift_flags (sku, card_id, drift_type, expected_location_id, actual_locations)
  VALUES (p_sku, p_card_id, p_drift_type, p_expected_location, p_actual_locations)
  RETURNING id INTO v_flag_id;
  
  RETURN v_flag_id;
END;
$$;

-- Resolve location drift
CREATE OR REPLACE FUNCTION resolve_location_drift(
  p_flag_id UUID,
  p_resolved_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE location_drift_flags
  SET 
    resolved_at = now(),
    resolved_by = p_resolved_by,
    notes = COALESCE(p_notes, notes)
  WHERE id = p_flag_id;
END;
$$;