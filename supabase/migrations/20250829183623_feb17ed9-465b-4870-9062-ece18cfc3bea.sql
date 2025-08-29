-- ================================
-- JUSTTCG SYNC SYSTEM MODERNIZATION (CORRECTED)
-- ================================

-- CLEANUP: Remove orphaned cards that reference non-existent sets
DELETE FROM catalog_v2.cards c 
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_v2.sets s 
  WHERE s.provider_id = c.set_provider_id AND s.game = c.game
);

-- CLEANUP: Remove orphaned variants that reference non-existent cards  
DELETE FROM catalog_v2.variants v 
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_v2.cards c 
  WHERE c.provider_id = v.card_provider_id AND c.game = v.game
);

-- ================================
-- NEW SYNC_V3 SCHEMA
-- ================================

-- Create sync_v3 schema
CREATE SCHEMA IF NOT EXISTS sync_v3;

-- Create job_type enum for better constraints
CREATE TYPE sync_v3.job_type AS ENUM ('games', 'sets', 'cards');

-- Create job_status enum
CREATE TYPE sync_v3.job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- Create modern jobs table
CREATE TABLE sync_v3.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type sync_v3.job_type NOT NULL,
  status sync_v3.job_status NOT NULL DEFAULT 'queued',
  source TEXT NOT NULL DEFAULT 'justtcg',
  
  -- Target information
  game TEXT,
  set_id TEXT,
  card_id TEXT,
  
  -- Progress tracking
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  progress_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN total_items > 0 THEN ROUND((processed_items::DECIMAL / total_items) * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Rate tracking
  items_per_second DECIMAL(8,2),
  estimated_completion_at TIMESTAMPTZ,
  
  -- Error handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  
  -- Results and metrics
  results JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_game_for_sets CHECK (
    job_type != 'sets' OR game IS NOT NULL
  ),
  CONSTRAINT valid_set_for_cards CHECK (
    job_type != 'cards' OR (game IS NOT NULL AND set_id IS NOT NULL)
  ),
  CONSTRAINT valid_progress CHECK (
    processed_items >= 0 AND processed_items <= COALESCE(total_items, processed_items)
  )
);

-- Enable RLS on sync_v3.jobs
ALTER TABLE sync_v3.jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for sync_v3.jobs
CREATE POLICY "Admins can manage sync jobs"
ON sync_v3.jobs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- ================================
-- UPDATE CATALOG_V2 TABLES (ADD MISSING COLUMNS)
-- ================================

-- Update catalog_v2.sets (add missing columns only)
ALTER TABLE catalog_v2.sets 
ADD COLUMN IF NOT EXISTS sync_job_id UUID REFERENCES sync_v3.jobs(id),
ADD COLUMN IF NOT EXISTS justtcg_metadata JSONB DEFAULT '{}';

-- Update catalog_v2.cards (add missing columns only)  
ALTER TABLE catalog_v2.cards
ADD COLUMN IF NOT EXISTS justtcg_card_id TEXT,
ADD COLUMN IF NOT EXISTS justtcg_metadata JSONB DEFAULT '{}';

-- Update catalog_v2.variants (add missing columns only)
ALTER TABLE catalog_v2.variants
ADD COLUMN IF NOT EXISTS price_history JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS justtcg_metadata JSONB DEFAULT '{}';

-- ================================
-- PERFORMANCE INDEXES
-- ================================

-- Indexes for sync_v3.jobs
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_v3.jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_type_game ON sync_v3.jobs(job_type, game);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON sync_v3.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_source ON sync_v3.jobs(source);

-- Indexes for catalog_v2.sets
CREATE INDEX IF NOT EXISTS idx_sets_sync_status ON catalog_v2.sets(sync_status);
CREATE INDEX IF NOT EXISTS idx_sets_sync_job_id ON catalog_v2.sets(sync_job_id);
CREATE INDEX IF NOT EXISTS idx_sets_last_synced_at ON catalog_v2.sets(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_sets_justtcg_set_id ON catalog_v2.sets(justtcg_set_id);

-- Indexes for catalog_v2.cards  
CREATE INDEX IF NOT EXISTS idx_cards_justtcg_card_id ON catalog_v2.cards(justtcg_card_id);
CREATE INDEX IF NOT EXISTS idx_cards_tcgplayer_id ON catalog_v2.cards(tcgplayer_id);

-- Indexes for catalog_v2.variants
CREATE INDEX IF NOT EXISTS idx_variants_justtcg_variant_id ON catalog_v2.variants(justtcg_variant_id);

-- ================================
-- UTILITY FUNCTIONS
-- ================================

-- Function to update job progress with rate calculation
CREATE OR REPLACE FUNCTION sync_v3.update_job_progress(
  job_id UUID,
  processed INTEGER,
  total INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_time TIMESTAMPTZ;
  elapsed_seconds NUMERIC;
  current_rate NUMERIC;
  eta TIMESTAMPTZ;
BEGIN
  -- Get job start time
  SELECT started_at INTO start_time
  FROM sync_v3.jobs
  WHERE id = job_id;
  
  -- Calculate rate if job has started
  IF start_time IS NOT NULL THEN
    elapsed_seconds := EXTRACT(EPOCH FROM (now() - start_time));
    
    IF elapsed_seconds > 0 AND processed > 0 THEN
      current_rate := processed / elapsed_seconds;
      
      -- Calculate ETA if we have total and rate
      IF total IS NOT NULL AND total > processed AND current_rate > 0 THEN
        eta := now() + INTERVAL '1 second' * ((total - processed) / current_rate);
      END IF;
    END IF;
  END IF;
  
  -- Update job
  UPDATE sync_v3.jobs
  SET 
    processed_items = processed,
    total_items = COALESCE(total, total_items),
    items_per_second = current_rate,
    estimated_completion_at = eta,
    updated_at = now()
  WHERE id = job_id;
END;
$$;

-- Function to complete a job
CREATE OR REPLACE FUNCTION sync_v3.complete_job(
  job_id UUID,
  job_status sync_v3.job_status,
  job_results JSONB DEFAULT NULL,
  job_metrics JSONB DEFAULT NULL,
  error_msg TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sync_v3.jobs
  SET 
    status = job_status,
    completed_at = now(),
    updated_at = now(),
    results = COALESCE(job_results, results),
    metrics = COALESCE(job_metrics, metrics),
    error_message = error_msg
  WHERE id = job_id;
END;
$$;

-- Function to start a job
CREATE OR REPLACE FUNCTION sync_v3.start_job(job_id UUID)
RETURNS void
LANGUAGE plpgsql  
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sync_v3.jobs
  SET 
    status = 'running',
    started_at = now(),
    updated_at = now()
  WHERE id = job_id;
END;
$$;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION sync_v3.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_jobs_updated_at
  BEFORE UPDATE ON sync_v3.jobs
  FOR EACH ROW
  EXECUTE FUNCTION sync_v3.update_updated_at();

-- ================================
-- DATA MIGRATION
-- ================================

-- Set existing sets to 'synced' if they have cards and update counters
UPDATE catalog_v2.sets s
SET 
  sync_status = 'synced',
  card_count = (
    SELECT COUNT(*)
    FROM catalog_v2.cards c 
    WHERE c.set_provider_id = s.provider_id AND c.game = s.game
  )
WHERE EXISTS (
  SELECT 1 FROM catalog_v2.cards c 
  WHERE c.set_provider_id = s.provider_id AND c.game = s.game
);

-- Update last_synced_at for sets with recent activity
UPDATE catalog_v2.sets 
SET last_synced_at = updated_at
WHERE sync_status = 'synced' AND last_synced_at IS NULL;