-- Drop existing function first
DROP FUNCTION IF EXISTS public.catalog_v2_get_recent_sync_errors(text, integer);

-- Create catalog_v2 schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS catalog_v2;

-- Drop existing tables to recreate with proper structure
DROP TABLE IF EXISTS catalog_v2.cards CASCADE;
DROP TABLE IF EXISTS catalog_v2.sets CASCADE;
DROP TABLE IF EXISTS catalog_v2.variants CASCADE;
DROP TABLE IF EXISTS catalog_v2.sync_errors CASCADE;

-- Create sets table with authoritative IDs
CREATE TABLE catalog_v2.sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    set_id TEXT NOT NULL,
    game TEXT NOT NULL,
    name TEXT,
    series TEXT,
    printed_total INTEGER,
    total INTEGER,
    release_date DATE,
    images JSONB,
    data JSONB,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_from_source_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on provider + set_id
    CONSTRAINT unique_provider_set_id UNIQUE (provider, set_id)
);

-- Create cards table with authoritative IDs  
CREATE TABLE catalog_v2.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    card_id TEXT NOT NULL,
    game TEXT NOT NULL,
    set_id TEXT NOT NULL,
    name TEXT,
    number TEXT,
    rarity TEXT,
    supertype TEXT,
    subtypes TEXT[],
    images JSONB,
    tcgplayer_product_id BIGINT,
    tcgplayer_url TEXT,
    data JSONB,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_from_source_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on provider + card_id
    CONSTRAINT unique_provider_card_id UNIQUE (provider, card_id),
    
    -- Foreign key to sets table
    CONSTRAINT fk_cards_set_id FOREIGN KEY (provider, set_id) REFERENCES catalog_v2.sets(provider, set_id) ON DELETE CASCADE
);

-- Create variants table with authoritative IDs
CREATE TABLE catalog_v2.variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    variant_id TEXT,
    variant_key TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN variant_id IS NOT NULL THEN variant_id
            ELSE encode(sha256((card_id || '|' || COALESCE(language, '') || '|' || COALESCE(printing, '') || '|' || COALESCE(condition, '') || '|' || COALESCE(sku, ''))::bytea), 'hex')
        END
    ) STORED,
    card_id TEXT NOT NULL,
    game TEXT NOT NULL,
    language TEXT,
    printing TEXT,
    condition TEXT,
    sku TEXT,
    price DECIMAL(10,2),
    market_price DECIMAL(10,2),
    low_price DECIMAL(10,2),
    mid_price DECIMAL(10,2),
    high_price DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    data JSONB,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_from_source_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on provider + variant_key (derived from variant_id or hash)
    CONSTRAINT unique_provider_variant_key UNIQUE (provider, variant_key),
    
    -- Foreign key to cards table
    CONSTRAINT fk_variants_card_id FOREIGN KEY (provider, card_id) REFERENCES catalog_v2.cards(provider, card_id) ON DELETE CASCADE
);

-- Recreate sync_errors table with provider support
CREATE TABLE catalog_v2.sync_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    game TEXT NOT NULL,
    set_id TEXT,
    card_id TEXT,
    step TEXT NOT NULL,
    message TEXT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create performance indexes
CREATE INDEX idx_sets_provider_game ON catalog_v2.sets (provider, game);
CREATE INDEX idx_sets_set_id ON catalog_v2.sets (set_id);
CREATE INDEX idx_sets_last_seen_at ON catalog_v2.sets (last_seen_at);
CREATE INDEX idx_sets_updated_from_source_at ON catalog_v2.sets (updated_from_source_at);

CREATE INDEX idx_cards_provider_game ON catalog_v2.cards (provider, game);
CREATE INDEX idx_cards_card_id ON catalog_v2.cards (card_id);
CREATE INDEX idx_cards_set_id ON catalog_v2.cards (set_id);
CREATE INDEX idx_cards_last_seen_at ON catalog_v2.cards (last_seen_at);
CREATE INDEX idx_cards_updated_from_source_at ON catalog_v2.cards (updated_from_source_at);

CREATE INDEX idx_variants_provider_game ON catalog_v2.variants (provider, game);
CREATE INDEX idx_variants_card_id ON catalog_v2.variants (card_id);
CREATE INDEX idx_variants_variant_key ON catalog_v2.variants (variant_key);
CREATE INDEX idx_variants_last_seen_at ON catalog_v2.variants (last_seen_at);
CREATE INDEX idx_variants_updated_from_source_at ON catalog_v2.variants (updated_from_source_at);

CREATE INDEX idx_sync_errors_provider_game ON catalog_v2.sync_errors (provider, game);
CREATE INDEX idx_sync_errors_created_at ON catalog_v2.sync_errors (created_at);