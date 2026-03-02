-- Reset any graded items that incorrectly have quantity > 1
UPDATE public.intake_items 
SET quantity = 1, updated_at = now() 
WHERE grading_company IS NOT NULL 
  AND grading_company != '' 
  AND grading_company != 'none' 
  AND quantity > 1;