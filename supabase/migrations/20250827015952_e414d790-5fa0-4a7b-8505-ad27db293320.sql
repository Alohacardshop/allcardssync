-- Clean reset for Pokémon (English) data
-- This will clear all existing Pokémon entries to allow fresh sync

-- Clear Pokémon variants
DELETE FROM catalog_v2.variants 
WHERE card_id IN (
  SELECT card_id FROM catalog_v2.cards WHERE game = 'pokemon'
);

-- Clear Pokémon cards
DELETE FROM catalog_v2.cards WHERE game = 'pokemon';

-- Clear Pokémon sets
DELETE FROM catalog_v2.sets WHERE game = 'pokemon';

-- Clear Pokémon sync errors
DELETE FROM catalog_v2.sync_errors WHERE game = 'pokemon';

-- Clear Pokémon queue entries
DELETE FROM public.sync_queue WHERE game = 'pokemon' OR mode = 'pokemon';