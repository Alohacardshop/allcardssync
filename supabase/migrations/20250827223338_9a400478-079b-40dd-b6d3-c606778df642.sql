-- Add indexes for better performance on catalog_v2 tables

-- Indexes for sets table
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_game ON catalog_v2.sets(game);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_game_set_id ON catalog_v2.sets(game, set_id);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_name_trgm ON catalog_v2.sets USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_set_id_trgm ON catalog_v2.sets USING gin(set_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_release_date ON catalog_v2.sets(release_date);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_last_seen_at ON catalog_v2.sets(last_seen_at);

-- Indexes for cards table
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_game ON catalog_v2.cards(game);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_game_set_id ON catalog_v2.cards(game, set_id);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_name_trgm ON catalog_v2.cards USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_card_id_trgm ON catalog_v2.cards USING gin(card_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_rarity ON catalog_v2.cards(rarity);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_last_seen_at ON catalog_v2.cards(last_seen_at);

-- Indexes for variants table
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_card_id ON catalog_v2.variants(card_id);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_variant_key_trgm ON catalog_v2.variants USING gin(variant_key gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_language ON catalog_v2.variants(language);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_printing ON catalog_v2.variants(printing);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_condition ON catalog_v2.variants(condition);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_price ON catalog_v2.variants(price);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_last_seen_at ON catalog_v2.variants(last_seen_at);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_game_name ON catalog_v2.cards(game, name);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_game_rarity ON catalog_v2.cards(game, rarity);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_card_game_join ON catalog_v2.variants(card_id) INCLUDE (language, printing, condition, price);

-- Rewrite browse functions to use dynamic SQL for better performance

-- Optimized browse_sets function
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_sets(
  game_in text, 
  filter_japanese boolean DEFAULT false, 
  search_in text DEFAULT NULL::text, 
  sort_by text DEFAULT 'set_id'::text, 
  sort_order text DEFAULT 'asc'::text, 
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
  normalized_game text;
  sort_clause text;
  search_clause text;
  count_query text;
  data_query text;
BEGIN
  -- Normalize the game slug
  normalized_game := normalize_game_slug(game_in);
  
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Build search clause
  IF search_in IS NOT NULL AND length(trim(search_in)) > 0 THEN
    search_clause := format('AND (s.name ILIKE %L OR s.set_id ILIKE %L)', '%' || search_in || '%', '%' || search_in || '%');
  ELSE
    search_clause := '';
  END IF;
  
  -- Build sort clause with proper column references
  CASE sort_by
    WHEN 'set_id' THEN sort_clause := 'set_id ' || sort_order;
    WHEN 'name' THEN sort_clause := 'name ' || sort_order;
    WHEN 'release_date' THEN sort_clause := 'release_date ' || sort_order || ' NULLS LAST';
    WHEN 'last_seen_at' THEN sort_clause := 'last_seen_at ' || sort_order || ' NULLS LAST';
    ELSE sort_clause := 'set_id ' || sort_order;
  END CASE;
  
  -- Get total count with optimized query
  count_query := format('
    SELECT COUNT(*)
    FROM catalog_v2.sets s
    WHERE (s.game = %L OR s.game = %L) %s',
    normalized_game, game_in, search_clause
  );
  
  EXECUTE count_query INTO total_count;
  
  -- Get sets data with pagination using optimized query
  data_query := format('
    WITH sets_with_cards AS (
      SELECT 
        s.set_id,
        s.name,
        s.release_date,
        s.total,
        s.last_seen_at,
        COUNT(c.id) as cards_count
      FROM catalog_v2.sets s
      LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = %L OR c.game = %L)
      WHERE (s.game = %L OR s.game = %L) %s
      GROUP BY s.set_id, s.name, s.release_date, s.total, s.last_seen_at
      ORDER BY %s
      LIMIT %s OFFSET %s
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        ''set_id'', set_id,
        ''name'', name,
        ''release_date'', release_date,
        ''total'', total,
        ''cards_count'', cards_count,
        ''last_seen_at'', last_seen_at
      )
    )
    FROM sets_with_cards',
    normalized_game, game_in, normalized_game, game_in, search_clause, sort_clause, limit_in, offset_val
  );
  
  EXECUTE data_query INTO sets_data;
  
  -- Return result
  RETURN jsonb_build_object(
    'sets', COALESCE(sets_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;

-- Optimized browse_cards function
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_cards(
  game_in text, 
  filter_japanese boolean DEFAULT false, 
  search_in text DEFAULT NULL::text, 
  set_id_in text DEFAULT NULL::text, 
  rarity_in text DEFAULT NULL::text, 
  sort_by text DEFAULT 'card_id'::text, 
  sort_order text DEFAULT 'asc'::text, 
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
  normalized_game text;
  sort_clause text;
  where_clause text;
  count_query text;
  data_query text;
BEGIN
  -- Normalize the game slug
  normalized_game := normalize_game_slug(game_in);
  
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Build where clause
  where_clause := format('WHERE (c.game = %L OR c.game = %L)', normalized_game, game_in);
  
  IF search_in IS NOT NULL AND length(trim(search_in)) > 0 THEN
    where_clause := where_clause || format(' AND (c.name ILIKE %L OR c.card_id ILIKE %L)', '%' || search_in || '%', '%' || search_in || '%');
  END IF;
  
  IF set_id_in IS NOT NULL THEN
    where_clause := where_clause || format(' AND c.set_id = %L', set_id_in);
  END IF;
  
  IF rarity_in IS NOT NULL THEN
    where_clause := where_clause || format(' AND c.rarity = %L', rarity_in);
  END IF;
  
  -- Build sort clause
  CASE sort_by
    WHEN 'card_id' THEN sort_clause := 'card_id ' || sort_order;
    WHEN 'name' THEN sort_clause := 'name ' || sort_order;
    WHEN 'set_id' THEN sort_clause := 'set_id ' || sort_order;
    WHEN 'rarity' THEN sort_clause := 'rarity ' || sort_order || ' NULLS LAST';
    WHEN 'last_seen_at' THEN sort_clause := 'last_seen_at ' || sort_order || ' NULLS LAST';
    ELSE sort_clause := 'card_id ' || sort_order;
  END CASE;
  
  -- Get total count
  count_query := format('SELECT COUNT(*) FROM catalog_v2.cards c %s', where_clause);
  EXECUTE count_query INTO total_count;
  
  -- Get cards data with pagination
  data_query := format('
    SELECT jsonb_agg(
      jsonb_build_object(
        ''card_id'', card_id,
        ''set_id'', set_id,
        ''name'', name,
        ''number'', number,
        ''rarity'', rarity,
        ''supertype'', supertype,
        ''last_seen_at'', last_seen_at
      )
    )
    FROM (
      SELECT *
      FROM catalog_v2.cards c
      %s
      ORDER BY %s
      LIMIT %s OFFSET %s
    ) sorted_cards',
    where_clause, sort_clause, limit_in, offset_val
  );
  
  EXECUTE data_query INTO cards_data;
  
  -- Return result
  RETURN jsonb_build_object(
    'cards', COALESCE(cards_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;

-- Optimized browse_variants function
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_variants(
  game_in text, 
  filter_japanese boolean DEFAULT false, 
  search_in text DEFAULT NULL::text, 
  set_id_in text DEFAULT NULL::text, 
  language_in text DEFAULT NULL::text, 
  printing_in text DEFAULT NULL::text, 
  condition_in text DEFAULT NULL::text, 
  price_min numeric DEFAULT NULL::numeric, 
  price_max numeric DEFAULT NULL::numeric, 
  sort_by text DEFAULT 'variant_key'::text, 
  sort_order text DEFAULT 'asc'::text, 
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
  sort_clause text;
  where_clause text;
  count_query text;
  data_query text;
BEGIN
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Build where clause
  where_clause := format('WHERE c.game = %L', game_in);
  
  IF search_in IS NOT NULL AND length(trim(search_in)) > 0 THEN
    where_clause := where_clause || format(' AND (v.variant_key ILIKE %L OR v.card_id ILIKE %L)', '%' || search_in || '%', '%' || search_in || '%');
  END IF;
  
  IF set_id_in IS NOT NULL THEN
    where_clause := where_clause || format(' AND c.set_id = %L', set_id_in);
  END IF;
  
  IF language_in IS NOT NULL THEN
    where_clause := where_clause || format(' AND v.language = %L', language_in);
  END IF;
  
  IF printing_in IS NOT NULL THEN
    where_clause := where_clause || format(' AND v.printing = %L', printing_in);
  END IF;
  
  IF condition_in IS NOT NULL THEN
    where_clause := where_clause || format(' AND v.condition = %L', condition_in);
  END IF;
  
  IF price_min IS NOT NULL THEN
    where_clause := where_clause || format(' AND v.price >= %s', price_min);
  END IF;
  
  IF price_max IS NOT NULL THEN
    where_clause := where_clause || format(' AND v.price <= %s', price_max);
  END IF;
  
  IF filter_japanese = true THEN
    where_clause := where_clause || ' AND v.language = ''Japanese''';
  END IF;
  
  -- Build sort clause
  CASE sort_by
    WHEN 'variant_key' THEN sort_clause := 'variant_key ' || sort_order;
    WHEN 'card_id' THEN sort_clause := 'v.card_id ' || sort_order;
    WHEN 'price' THEN sort_clause := 'price ' || sort_order || ' NULLS LAST';
    WHEN 'language' THEN sort_clause := 'language ' || sort_order || ' NULLS LAST';
    WHEN 'last_seen_at' THEN sort_clause := 'v.last_seen_at ' || sort_order || ' NULLS LAST';
    ELSE sort_clause := 'variant_key ' || sort_order;
  END CASE;
  
  -- Get total count
  count_query := format('
    SELECT COUNT(*)
    FROM catalog_v2.variants v
    JOIN catalog_v2.cards c ON c.card_id = v.card_id
    %s', where_clause);
  EXECUTE count_query INTO total_count;
  
  -- Get variants data with pagination
  data_query := format('
    SELECT jsonb_agg(
      jsonb_build_object(
        ''variant_key'', variant_key,
        ''card_id'', v.card_id,
        ''language'', language,
        ''printing'', printing,
        ''condition'', condition,
        ''sku'', sku,
        ''price'', price,
        ''market_price'', market_price,
        ''currency'', currency,
        ''last_seen_at'', v.last_seen_at
      )
    )
    FROM (
      SELECT v.*
      FROM catalog_v2.variants v
      JOIN catalog_v2.cards c ON c.card_id = v.card_id
      %s
      ORDER BY %s
      LIMIT %s OFFSET %s
    ) sorted_variants',
    where_clause, sort_clause, limit_in, offset_val
  );
  
  EXECUTE data_query INTO variants_data;
  
  -- Return result
  RETURN jsonb_build_object(
    'variants', COALESCE(variants_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;