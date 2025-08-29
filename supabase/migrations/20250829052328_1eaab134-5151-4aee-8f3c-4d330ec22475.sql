
-- 1) Ensure schema exists (safe if already present)
CREATE SCHEMA IF NOT EXISTS catalog_v2;

-- 2) Checkpoints table for provider sync cursors
CREATE TABLE IF NOT EXISTS catalog_v2.provider_sync_state (
  provider     text        NOT NULL,
  game         text        NOT NULL,
  entity       text        NOT NULL,  -- e.g. 'sets', 'cards:<set_provider_id>', 'variants:<card_provider_id>'
  cursor_json  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, game, entity)
);

-- 3) Optional raw payload capture (for debugging / replay)
CREATE TABLE IF NOT EXISTS catalog_v2.provider_raw_events (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider   text         NOT NULL,
  game       text         NOT NULL,
  entity     text         NOT NULL,     -- 'sets' | 'cards' | 'variants'
  page_key   text         NOT NULL,     -- e.g. 'offset=500' or any cursor marker
  payload    jsonb        NOT NULL,
  fetched_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pre_provider_game_entity_idx
  ON catalog_v2.provider_raw_events (provider, game, entity, fetched_at DESC);

-- 4) Guardrail function for sets_new: null provider_id when normalized names mismatch
CREATE OR REPLACE FUNCTION public.catalog_v2_guardrail_sets_new(
  game_in   text,
  api_sets  jsonb   -- array of { provider_id: text, name: text }
)
RETURNS TABLE(rolled_back integer, not_found integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rb_count integer := 0;
  nf_count integer := 0;
BEGIN
  -- Temp staging of API sets for comparison
  CREATE TEMP TABLE tmp_api_sets (provider_id text, api_name text) ON COMMIT DROP;

  INSERT INTO tmp_api_sets (provider_id, api_name)
  SELECT
    nullif(r->>'provider_id',''),
    COALESCE(r->>'name', r->>'api_name')
  FROM jsonb_array_elements(api_sets) AS r
  WHERE (r ? 'provider_id') AND (r->>'provider_id') IS NOT NULL;

  -- Count API provider_ids not present in sets_new for this game
  SELECT COUNT(*) INTO nf_count
  FROM tmp_api_sets a
  LEFT JOIN catalog_v2.sets_new s
    ON s.game = game_in AND s.provider_id = a.provider_id
  WHERE s.provider_id IS NULL;

  -- Null out provider_id where normalized names differ (exact-only guardrail)
  WITH mismatches AS (
    SELECT s.provider_id
    FROM catalog_v2.sets_new s
    JOIN tmp_api_sets a ON a.provider_id = s.provider_id
    WHERE s.game = game_in
      AND regexp_replace(lower(s.name), '[^a-z0-9]+', ' ', 'g')
        <> regexp_replace(lower(a.api_name), '[^a-z0-9]+', ' ', 'g')
  )
  UPDATE catalog_v2.sets_new s
  SET provider_id = NULL
  WHERE s.game = game_in
    AND s.provider_id IN (SELECT provider_id FROM mismatches);

  GET DIAGNOSTICS rb_count = ROW_COUNT;

  RETURN QUERY SELECT rb_count, nf_count;
END;
$function$;
