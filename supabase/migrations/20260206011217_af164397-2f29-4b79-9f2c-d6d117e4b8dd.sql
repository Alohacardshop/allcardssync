-- Create shopify_collections table for caching Shopify collections
CREATE TABLE public.shopify_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL,
  collection_gid text NOT NULL,
  title text NOT NULL,
  handle text,
  product_count integer DEFAULT 0,
  collection_type text,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(store_key, collection_gid)
);

-- Enable RLS
ALTER TABLE public.shopify_collections ENABLE ROW LEVEL SECURITY;

-- Create policy for reading collections (authenticated users can read all collections)
CREATE POLICY "Authenticated users can read collections"
ON public.shopify_collections
FOR SELECT
TO authenticated
USING (true);

-- Create policy for service role to manage collections
CREATE POLICY "Service role can manage collections"
ON public.shopify_collections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add index for faster lookups by store_key
CREATE INDEX idx_shopify_collections_store_key ON public.shopify_collections(store_key);

-- Add comment
COMMENT ON TABLE public.shopify_collections IS 'Cache of Shopify collections for filtering inventory';