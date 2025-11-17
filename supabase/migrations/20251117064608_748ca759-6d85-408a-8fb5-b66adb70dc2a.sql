-- Step 1: Update intake_items that reference sports category to null
-- These items will need to be re-categorized manually
UPDATE intake_items
SET main_category = NULL,
    sub_category = NULL,
    updated_at = now(),
    updated_by = 'sports_cleanup_migration'
WHERE main_category = 'sports';

-- Step 2: Delete all sub_categories that belong to sports
DELETE FROM sub_categories
WHERE main_category_id = 'sports';

-- Step 3: Delete the sports main_category
DELETE FROM main_categories
WHERE id = 'sports';

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Sports category cleanup complete: Updated % items, removed sports main category and all sub-categories', 
    (SELECT COUNT(*) FROM intake_items WHERE updated_by = 'sports_cleanup_migration');
END $$;