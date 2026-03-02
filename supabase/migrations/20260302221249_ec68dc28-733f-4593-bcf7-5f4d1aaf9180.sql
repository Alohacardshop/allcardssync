-- Fix get_tag_counts: add fixed search_path to prevent search path injection
CREATE OR REPLACE FUNCTION public.get_tag_counts(p_store_key text)
 RETURNS TABLE(tag text, count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT unnest(i.normalized_tags) as tag, COUNT(*) as count
  FROM public.intake_items i
  WHERE i.store_key = p_store_key 
    AND i.deleted_at IS NULL
    AND i.normalized_tags IS NOT NULL
    AND array_length(i.normalized_tags, 1) > 0
  GROUP BY 1
  ORDER BY count DESC;
END;
$function$;