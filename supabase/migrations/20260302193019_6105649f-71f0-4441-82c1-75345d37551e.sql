
-- On-demand DB-backed cache for eBay category condition policies + aspects
CREATE TABLE public.ebay_category_schema_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'production',
  marketplace_id text NOT NULL,
  category_id text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]',
  aspects jsonb NOT NULL DEFAULT '[]',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, marketplace_id, category_id)
);

-- Index for fast lookups
CREATE INDEX idx_ebay_category_schema_cache_lookup 
  ON public.ebay_category_schema_cache (environment, marketplace_id, category_id);

-- RLS: service-role only (edge functions use service role key)
ALTER TABLE public.ebay_category_schema_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (for UI)
CREATE POLICY "Authenticated users can read schema cache"
  ON public.ebay_category_schema_cache
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.ebay_category_schema_cache IS 
  'On-demand cache for eBay category condition policies and aspects. Populated lazily when templates are edited or listings processed. TTL-based staleness check.';
