
-- Allow unauthenticated sessions to read catalog stats (read-only aggregates)
GRANT EXECUTE ON FUNCTION public.catalog_v2_stats(text) TO anon;
