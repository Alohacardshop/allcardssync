-- Clean reset of all catalog data to start fresh
DELETE FROM catalog_v2.variants;
DELETE FROM catalog_v2.cards;  
DELETE FROM catalog_v2.sets;
DELETE FROM catalog_v2.sets_new;
DELETE FROM catalog_v2.cards_new;
DELETE FROM catalog_v2.variants_new;
DELETE FROM sync_queue;
DELETE FROM catalog_v2.sync_errors;

-- Also reset games table to start fresh
DELETE FROM games;
DELETE FROM sets;
DELETE FROM justtcg_games;