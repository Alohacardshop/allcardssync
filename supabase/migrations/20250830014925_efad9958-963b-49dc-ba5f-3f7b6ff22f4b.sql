-- Add product_weight column to intake_items table
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS product_weight NUMERIC(5,2);

-- Add comment for clarity
COMMENT ON COLUMN public.intake_items.product_weight IS 'Product weight in ounces - 3 oz for graded cards, 1 oz for raw cards';