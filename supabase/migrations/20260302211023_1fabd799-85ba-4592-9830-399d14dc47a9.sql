-- Update ebay_categories: replace invalid 259061 with 259104
UPDATE public.ebay_categories SET id = '259104', name = 'Graded Comic Books' WHERE id = '259061';

-- Update all 4 graded comic templates to point to the new category
UPDATE public.ebay_listing_templates SET category_id = '259104' WHERE category_id = '259061';
