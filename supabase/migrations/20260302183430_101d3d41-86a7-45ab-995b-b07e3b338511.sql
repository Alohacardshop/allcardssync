-- Fix the "Graded Comic (PSA)" template that has wrong condition_id
-- Comics category (63) requires condition 3000 (Like New), not 2750 (Professionally Graded which is for trading cards)
UPDATE public.ebay_listing_templates 
SET condition_id = '3000', updated_at = now()
WHERE id = '04748fde-ae80-40a2-afa1-4a3ffbaf1f50';