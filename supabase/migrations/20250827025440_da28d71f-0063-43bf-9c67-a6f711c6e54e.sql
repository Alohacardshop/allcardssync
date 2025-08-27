-- Comprehensive catalog reset for all games (Pokemon, Pokemon Japan, MTG)
-- This will clear all existing entries to allow fresh sync

BEGIN;

-- Clear variants for all games
DELETE FROM catalog_v2.variants 
WHERE card_id IN (
  SELECT card_id FROM catalog_v2.cards WHERE game IN ('pokemon', 'pokemon-japan', 'mtg')
);

-- Clear cards for all games  
DELETE FROM catalog_v2.cards WHERE game IN ('pokemon', 'pokemon-japan', 'mtg');

-- Clear sets for all games
DELETE FROM catalog_v2.sets WHERE game IN ('pokemon', 'pokemon-japan', 'mtg');

-- Clear sync errors for all games
DELETE FROM catalog_v2.sync_errors WHERE game IN ('pokemon', 'pokemon-japan', 'mtg');

-- Clear queue entries for all games (using both game and mode columns)
DELETE FROM public.sync_queue WHERE game IN ('pokemon', 'pokemon-japan', 'mtg') 
  OR mode IN ('pokemon', 'pokemon-japan', 'mtg');

COMMIT;