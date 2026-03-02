-- Fix the existing graded comic with quantity 2
UPDATE public.intake_items 
SET quantity = 1, updated_at = now() 
WHERE id = '5d89030b-9a5e-42f6-aab8-bb0241c818c8' AND quantity = 2;

-- Drop the old 19-arg overloads that don't include grading_company_in
-- These cause PostgREST disambiguation issues
DROP FUNCTION IF EXISTS public.create_raw_intake_item(
  text, text, integer, text, text, text, text, text, text, numeric, numeric, text, text, text, text, text, jsonb, jsonb, text
);
