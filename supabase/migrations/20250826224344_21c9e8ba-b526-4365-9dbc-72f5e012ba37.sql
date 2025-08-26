-- Step 2: Backfill existing data to use canonical game slugs

-- Update sets to use canonical game slugs
UPDATE catalog_v2.sets 
SET game = normalize_game_slug(game)
WHERE game != normalize_game_slug(game);

-- Update cards to use canonical game slugs  
UPDATE catalog_v2.cards 
SET game = normalize_game_slug(game)
WHERE game != normalize_game_slug(game);

-- Update variants to use canonical game slugs
UPDATE catalog_v2.variants 
SET game = normalize_game_slug(game)
WHERE game != normalize_game_slug(game);

-- Update sync_queue to use canonical game slugs
UPDATE public.sync_queue 
SET game = normalize_game_slug(game)
WHERE game != normalize_game_slug(game);