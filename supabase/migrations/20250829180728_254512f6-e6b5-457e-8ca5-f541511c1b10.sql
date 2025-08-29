-- Add JustTCG synchronization support to catalog_v2 schema

-- 1. ALTER catalog_v2.sets table to add sync tracking columns
ALTER TABLE catalog_v2.sets 
ADD COLUMN sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'partial')),
ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN card_count INTEGER DEFAULT 0,
ADD COLUMN justtcg_set_id TEXT;

-- 2. CREATE sync_jobs table for job tracking and management
CREATE TABLE catalog_v2.sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL CHECK (job_type IN ('games', 'sets', 'cards')),
    game_slug TEXT,
    set_id TEXT,
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    progress JSONB DEFAULT '{"current": 0, "total": 0}',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'
);

-- 3. ALTER catalog_v2.cards table to add JustTCG and TCGPlayer identifiers
ALTER TABLE catalog_v2.cards 
ADD COLUMN justtcg_id TEXT,
ADD COLUMN tcgplayer_id INTEGER;

-- 4. ALTER catalog_v2.variants table to add JustTCG tracking
ALTER TABLE catalog_v2.variants 
ADD COLUMN justtcg_variant_id TEXT,
ADD COLUMN last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. CREATE performance indexes
CREATE INDEX idx_sync_jobs_status ON catalog_v2.sync_jobs(status);
CREATE INDEX idx_sync_jobs_type_game ON catalog_v2.sync_jobs(job_type, game_slug);
CREATE INDEX idx_sets_sync_status ON catalog_v2.sets(sync_status);
CREATE INDEX idx_cards_justtcg_id ON catalog_v2.cards(justtcg_id);

-- Add comments for documentation
COMMENT ON COLUMN catalog_v2.sets.sync_status IS 'Synchronization status: pending/synced/failed/partial';
COMMENT ON COLUMN catalog_v2.sets.justtcg_set_id IS 'JustTCG API set identifier for mapping';
COMMENT ON COLUMN catalog_v2.cards.justtcg_id IS 'JustTCG API card identifier for mapping';
COMMENT ON COLUMN catalog_v2.variants.justtcg_variant_id IS 'JustTCG API variant identifier for mapping';
COMMENT ON TABLE catalog_v2.sync_jobs IS 'Job tracking table for JustTCG API synchronization operations';