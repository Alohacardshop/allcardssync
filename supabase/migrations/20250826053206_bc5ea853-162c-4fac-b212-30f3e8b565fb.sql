-- Grant execute permissions to service_role for http_post_async function
GRANT EXECUTE ON FUNCTION public.http_post_async(text, jsonb, jsonb) TO service_role;