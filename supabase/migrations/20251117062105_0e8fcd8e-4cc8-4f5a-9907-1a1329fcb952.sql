-- Drop sports card (ALT) integration tables in correct order
-- Drop foreign key dependent tables first

-- Drop card_transactions (has FK to alt_items and shows)
DROP TABLE IF EXISTS public.card_transactions CASCADE;

-- Drop alt_items
DROP TABLE IF EXISTS public.alt_items CASCADE;

-- Drop alt_credentials
DROP TABLE IF EXISTS public.alt_credentials CASCADE;

-- Drop shows (has FK to locations)
DROP TABLE IF EXISTS public.shows CASCADE;

-- Drop locations
DROP TABLE IF EXISTS public.locations CASCADE;

-- Drop scrape_sessions
DROP TABLE IF EXISTS public.scrape_sessions CASCADE;

-- Clean up any sports items in intake_items by reclassifying to tcg
UPDATE public.intake_items
SET main_category = 'tcg'
WHERE main_category = 'sports' AND deleted_at IS NULL;