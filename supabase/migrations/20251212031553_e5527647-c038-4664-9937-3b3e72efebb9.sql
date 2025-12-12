-- Fix the parameterized version of get_distinct_categories which lacks search_path
CREATE OR REPLACE FUNCTION public.get_distinct_categories(store_key_in text, location_gid_in text DEFAULT NULL::text)
 RETURNS TABLE(category_value text)
 LANGUAGE plpgsql
 STABLE 
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT lower(cat) AS category_value
  FROM public.intake_items,
       LATERAL (
         SELECT main_category AS cat WHERE main_category IS NOT NULL
         UNION
         SELECT category AS cat WHERE category IS NOT NULL
         UNION
         SELECT sub_category AS cat WHERE sub_category IS NOT NULL
       ) cats
  WHERE store_key = store_key_in
    AND deleted_at IS NULL
    AND (location_gid_in IS NULL OR shopify_location_gid = location_gid_in)
  ORDER BY category_value;
END;
$function$;