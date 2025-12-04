-- Create function to get distinct categories efficiently
CREATE OR REPLACE FUNCTION get_distinct_categories(
  store_key_in TEXT,
  location_gid_in TEXT DEFAULT NULL
)
RETURNS TABLE(category_value TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT lower(cat) AS category_value
  FROM intake_items,
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;