-- Create catalog_v2_browse_sets function
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_sets(
  game_in text,
  filter_japanese boolean DEFAULT false,
  search_in text DEFAULT null,
  sort_by text DEFAULT 'set_id',
  sort_order text DEFAULT 'asc',
  page_in integer DEFAULT 1,
  limit_in integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  offset_val integer;
  total_count integer;
  sets_data jsonb;
  order_clause text;
BEGIN
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Build order clause
  order_clause := format('ORDER BY %I %s', sort_by, CASE WHEN sort_order = 'desc' THEN 'DESC' ELSE 'ASC' END);
  
  -- Get total count
  SELECT COUNT(*) INTO total_count
  FROM catalog_v2.sets s
  WHERE s.game = game_in
    AND (search_in IS NULL OR s.name ILIKE '%' || search_in || '%' OR s.set_id ILIKE '%' || search_in || '%');
  
  -- Get sets data with pagination
  WITH sets_with_cards AS (
    SELECT 
      s.set_id,
      s.name,
      s.release_date,
      s.total,
      s.last_seen_at,
      COUNT(c.id) as cards_count
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND c.game = game_in
    WHERE s.game = game_in
      AND (search_in IS NULL OR s.name ILIKE '%' || search_in || '%' OR s.set_id ILIKE '%' || search_in || '%')
    GROUP BY s.set_id, s.name, s.release_date, s.total, s.last_seen_at
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'set_id', set_id,
      'name', name,
      'release_date', release_date,
      'total', total,
      'cards_count', cards_count,
      'last_seen_at', last_seen_at
    )
  ) INTO sets_data
  FROM (
    SELECT *
    FROM sets_with_cards
    ORDER BY 
      CASE WHEN sort_by = 'set_id' AND sort_order = 'asc' THEN set_id END ASC,
      CASE WHEN sort_by = 'set_id' AND sort_order = 'desc' THEN set_id END DESC,
      CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN name END ASC,
      CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN name END DESC,
      CASE WHEN sort_by = 'release_date' AND sort_order = 'asc' THEN release_date END ASC,
      CASE WHEN sort_by = 'release_date' AND sort_order = 'desc' THEN release_date END DESC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'asc' THEN last_seen_at END ASC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'desc' THEN last_seen_at END DESC
    LIMIT limit_in OFFSET offset_val
  ) sorted_sets;
  
  -- Return result
  RETURN jsonb_build_object(
    'sets', COALESCE(sets_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;

-- Create catalog_v2_browse_cards function
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_cards(
  game_in text,
  filter_japanese boolean DEFAULT false,
  search_in text DEFAULT null,
  set_id_in text DEFAULT null,
  rarity_in text DEFAULT null,
  sort_by text DEFAULT 'card_id',
  sort_order text DEFAULT 'asc',
  page_in integer DEFAULT 1,
  limit_in integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  offset_val integer;
  total_count integer;
  cards_data jsonb;
BEGIN
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Get total count
  SELECT COUNT(*) INTO total_count
  FROM catalog_v2.cards c
  WHERE c.game = game_in
    AND (search_in IS NULL OR c.name ILIKE '%' || search_in || '%' OR c.card_id ILIKE '%' || search_in || '%')
    AND (set_id_in IS NULL OR c.set_id = set_id_in)
    AND (rarity_in IS NULL OR c.rarity = rarity_in);
  
  -- Get cards data with pagination
  SELECT jsonb_agg(
    jsonb_build_object(
      'card_id', card_id,
      'set_id', set_id,
      'name', name,
      'number', number,
      'rarity', rarity,
      'supertype', supertype,
      'last_seen_at', last_seen_at
    )
  ) INTO cards_data
  FROM (
    SELECT *
    FROM catalog_v2.cards c
    WHERE c.game = game_in
      AND (search_in IS NULL OR c.name ILIKE '%' || search_in || '%' OR c.card_id ILIKE '%' || search_in || '%')
      AND (set_id_in IS NULL OR c.set_id = set_id_in)
      AND (rarity_in IS NULL OR c.rarity = rarity_in)
    ORDER BY 
      CASE WHEN sort_by = 'card_id' AND sort_order = 'asc' THEN card_id END ASC,
      CASE WHEN sort_by = 'card_id' AND sort_order = 'desc' THEN card_id END DESC,
      CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN name END ASC,
      CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN name END DESC,
      CASE WHEN sort_by = 'set_id' AND sort_order = 'asc' THEN set_id END ASC,
      CASE WHEN sort_by = 'set_id' AND sort_order = 'desc' THEN set_id END DESC,
      CASE WHEN sort_by = 'rarity' AND sort_order = 'asc' THEN rarity END ASC,
      CASE WHEN sort_by = 'rarity' AND sort_order = 'desc' THEN rarity END DESC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'asc' THEN last_seen_at END ASC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'desc' THEN last_seen_at END DESC
    LIMIT limit_in OFFSET offset_val
  ) sorted_cards;
  
  -- Return result
  RETURN jsonb_build_object(
    'cards', COALESCE(cards_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;

-- Create catalog_v2_browse_variants function
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_variants(
  game_in text,
  filter_japanese boolean DEFAULT false,
  search_in text DEFAULT null,
  set_id_in text DEFAULT null,
  language_in text DEFAULT null,
  printing_in text DEFAULT null,
  condition_in text DEFAULT null,
  price_min decimal DEFAULT null,
  price_max decimal DEFAULT null,
  sort_by text DEFAULT 'variant_key',
  sort_order text DEFAULT 'asc',
  page_in integer DEFAULT 1,
  limit_in integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  offset_val integer;
  total_count integer;
  variants_data jsonb;
BEGIN
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Get total count
  SELECT COUNT(*) INTO total_count
  FROM catalog_v2.variants v
  JOIN catalog_v2.cards c ON c.card_id = v.card_id
  WHERE c.game = game_in
    AND (search_in IS NULL OR v.variant_key ILIKE '%' || search_in || '%' OR v.card_id ILIKE '%' || search_in || '%')
    AND (set_id_in IS NULL OR c.set_id = set_id_in)
    AND (language_in IS NULL OR v.language = language_in)
    AND (printing_in IS NULL OR v.printing = printing_in)
    AND (condition_in IS NULL OR v.condition = condition_in)
    AND (price_min IS NULL OR v.price >= price_min)
    AND (price_max IS NULL OR v.price <= price_max)
    AND (filter_japanese = false OR v.language = 'Japanese');
  
  -- Get variants data with pagination
  SELECT jsonb_agg(
    jsonb_build_object(
      'variant_key', variant_key,
      'card_id', v.card_id,
      'language', language,
      'printing', printing,
      'condition', condition,
      'sku', sku,
      'price', price,
      'market_price', market_price,
      'currency', currency,
      'last_seen_at', v.last_seen_at
    )
  ) INTO variants_data
  FROM (
    SELECT v.*
    FROM catalog_v2.variants v
    JOIN catalog_v2.cards c ON c.card_id = v.card_id
    WHERE c.game = game_in
      AND (search_in IS NULL OR v.variant_key ILIKE '%' || search_in || '%' OR v.card_id ILIKE '%' || search_in || '%')
      AND (set_id_in IS NULL OR c.set_id = set_id_in)
      AND (language_in IS NULL OR v.language = language_in)
      AND (printing_in IS NULL OR v.printing = printing_in)
      AND (condition_in IS NULL OR v.condition = condition_in)
      AND (price_min IS NULL OR v.price >= price_min)
      AND (price_max IS NULL OR v.price <= price_max)
      AND (filter_japanese = false OR v.language = 'Japanese')
    ORDER BY 
      CASE WHEN sort_by = 'variant_key' AND sort_order = 'asc' THEN variant_key END ASC,
      CASE WHEN sort_by = 'variant_key' AND sort_order = 'desc' THEN variant_key END DESC,
      CASE WHEN sort_by = 'card_id' AND sort_order = 'asc' THEN v.card_id END ASC,
      CASE WHEN sort_by = 'card_id' AND sort_order = 'desc' THEN v.card_id END DESC,
      CASE WHEN sort_by = 'price' AND sort_order = 'asc' THEN price END ASC,
      CASE WHEN sort_by = 'price' AND sort_order = 'desc' THEN price END DESC,
      CASE WHEN sort_by = 'language' AND sort_order = 'asc' THEN language END ASC,
      CASE WHEN sort_by = 'language' AND sort_order = 'desc' THEN language END DESC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'asc' THEN v.last_seen_at END ASC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'desc' THEN v.last_seen_at END DESC
    LIMIT limit_in OFFSET offset_val
  ) sorted_variants;
  
  -- Return result
  RETURN jsonb_build_object(
    'variants', COALESCE(variants_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;