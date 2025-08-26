-- Async HTTP scheduler that Edge Functions can call via supabase-js RPC
CREATE OR REPLACE FUNCTION public.http_post_async(url text, headers jsonb, body jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  SELECT (net.http_post(url := url, headers := headers, body := body)).request_id INTO rid;
  RETURN rid;
END$$;

REVOKE ALL ON FUNCTION public.http_post_async(text,jsonb,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.http_post_async(text,jsonb,jsonb) TO authenticated;

-- Create error logging table
CREATE TABLE IF NOT EXISTS catalog_v2.sync_errors (
  id bigserial PRIMARY KEY,
  game text NOT NULL,
  set_id text,
  step text,
  message text,
  detail jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE catalog_v2.sync_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read" ON catalog_v2.sync_errors;
CREATE POLICY "auth read" ON catalog_v2.sync_errors FOR SELECT USING (auth.uid() IS NOT NULL);

-- Error logging function
CREATE OR REPLACE FUNCTION public.catalog_v2_log_error(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO catalog_v2.sync_errors (game, set_id, step, message, detail)
  VALUES (payload->>'game', payload->>'set_id', payload->>'step', payload->>'message', payload->'detail');
END$$;

REVOKE ALL ON FUNCTION public.catalog_v2_log_error(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.catalog_v2_log_error(jsonb) TO authenticated;