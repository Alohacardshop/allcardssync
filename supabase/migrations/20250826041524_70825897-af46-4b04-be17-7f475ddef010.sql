
-- Fix http_post_async to match current pg_net behavior (returns bigint request_id)
-- 1) Drop the existing function (returns uuid and tries to access `.request_id`)
DROP FUNCTION IF EXISTS public.http_post_async(text, jsonb, jsonb);

-- 2) Recreate with bigint return type and direct assignment
CREATE OR REPLACE FUNCTION public.http_post_async(url text, headers jsonb, body jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid bigint;
BEGIN
  -- In current pg_net, http_post returns the async request_id as bigint
  rid := net.http_post(url := url, headers := headers, body := body);
  RETURN rid;
END
$$;

-- 3) Lock down and grant execution as before
REVOKE ALL ON FUNCTION public.http_post_async(text, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.http_post_async(text, jsonb, jsonb) TO authenticated;
