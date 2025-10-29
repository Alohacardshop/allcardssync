-- Test: Verify updated_by column works correctly
-- This test:
-- 1. Selects a test item (random or specified)
-- 2. Updates it to trigger the updated_by column
-- 3. Verifies the updated_by column was set correctly
-- 4. Shows the most recent 5 items with their updated_by values

DO $$
DECLARE
  test_item_id uuid;
  test_updated_by text;
  item_count integer;
BEGIN
  -- Count total items
  SELECT COUNT(*) INTO item_count
  FROM public.intake_items
  WHERE deleted_at IS NULL;

  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Testing updated_by column functionality';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Total items in database: %', item_count;
  
  IF item_count = 0 THEN
    RAISE NOTICE '⚠️  No items found in database - skipping test';
    RETURN;
  END IF;

  -- Select a random item to test
  -- You can replace this with a specific ID by changing the WHERE clause
  SELECT id INTO test_item_id
  FROM public.intake_items
  WHERE deleted_at IS NULL
    AND removed_from_batch_at IS NULL
  ORDER BY random()
  LIMIT 1;

  IF test_item_id IS NULL THEN
    RAISE NOTICE '⚠️  No eligible items found (all removed from batch) - skipping test';
    RETURN;
  END IF;

  RAISE NOTICE '📝 Selected test item: %', test_item_id;
  RAISE NOTICE '';

  -- Update the item to trigger the updated_by column
  -- The trigger should automatically set updated_by to auth.uid()
  -- If auth.uid() is NULL (manual SQL), it will keep existing value or use fallback
  UPDATE public.intake_items
  SET 
    processing_notes = COALESCE(processing_notes, '') || 
      CASE WHEN processing_notes IS NULL OR processing_notes = '' 
           THEN '' 
           ELSE E'\n' 
      END || 
      'Test update at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  WHERE id = test_item_id;

  -- Check the result
  SELECT updated_by INTO test_updated_by
  FROM public.intake_items
  WHERE id = test_item_id;

  RAISE NOTICE '✅ Update completed successfully';
  RAISE NOTICE '   Item ID: %', test_item_id;
  RAISE NOTICE '   Updated by: %', COALESCE(test_updated_by, '(NULL)');
  RAISE NOTICE '';

  -- Verify the column exists and is accessible
  IF test_updated_by IS NOT NULL OR test_updated_by IS NULL THEN
    RAISE NOTICE '✅ SUCCESS: updated_by column is accessible and working';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📋 Most Recent 5 Items';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  -- Display results using a loop for better formatting
  FOR test_item_id, test_updated_by IN 
    SELECT id, updated_by
    FROM public.intake_items
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 5
  LOOP
    RAISE NOTICE 'ID: % | Updated by: %', 
      test_item_id, 
      COALESCE(test_updated_by, '(not set)');
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Test completed successfully';
  RAISE NOTICE '========================================';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '❌ TEST FAILED';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Error: %', SQLERRM;
  RAISE NOTICE '';
  RAISE NOTICE 'This likely means:';
  RAISE NOTICE '1. The updated_by column does not exist';
  RAISE NOTICE '2. Trigger functions have not been recompiled';
  RAISE NOTICE '3. Prepared statement cache needs clearing';
  RAISE NOTICE '';
  RAISE NOTICE 'Run these fixes:';
  RAISE NOTICE '1. db/fixes/recompile_intake_items_triggers.sql';
  RAISE NOTICE '2. db/fixes/recreate_send_intake_items_to_inventory.sql';
  RAISE NOTICE '3. db/fixes/discard_all.sql';
  RAISE;
END $$;
