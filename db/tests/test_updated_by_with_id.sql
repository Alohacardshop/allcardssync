-- Test: Verify updated_by column works with specific item ID
-- Usage: Replace 'YOUR-ITEM-ID-HERE' with an actual UUID from your database
-- 
-- To find a valid item ID, run this first:
-- SELECT id, sku, brand_title FROM public.intake_items 
-- WHERE deleted_at IS NULL LIMIT 5;

DO $$
DECLARE
  test_item_id uuid := 'YOUR-ITEM-ID-HERE'; -- REPLACE THIS
  test_updated_by text;
  item_exists boolean;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '🧪 Testing updated_by with specific ID';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Testing item: %', test_item_id;

  -- Check if item exists
  SELECT EXISTS(
    SELECT 1 FROM public.intake_items 
    WHERE id = test_item_id AND deleted_at IS NULL
  ) INTO item_exists;

  IF NOT item_exists THEN
    RAISE NOTICE '❌ Item not found or deleted: %', test_item_id;
    RAISE NOTICE '';
    RAISE NOTICE 'To find a valid ID, run:';
    RAISE NOTICE 'SELECT id, sku, brand_title FROM public.intake_items';
    RAISE NOTICE 'WHERE deleted_at IS NULL LIMIT 5;';
    RETURN;
  END IF;

  RAISE NOTICE '✅ Item found';
  RAISE NOTICE '';

  -- Update the item
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
  RAISE NOTICE '   Current user: %', COALESCE(auth.uid()::text, '(not authenticated)');
  RAISE NOTICE '';

  IF test_updated_by IS NOT NULL THEN
    RAISE NOTICE '✅ SUCCESS: updated_by column is working correctly';
  ELSIF auth.uid() IS NULL THEN
    RAISE NOTICE '⚠️  Note: Running as unauthenticated SQL, updated_by may be NULL';
    RAISE NOTICE '   This is expected when running in SQL Editor';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Test completed';
  RAISE NOTICE '========================================';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '❌ TEST FAILED';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Error: %', SQLERRM;
  RAISE NOTICE '';
  RAISE NOTICE 'Run db/fixes/recompile_intake_items_triggers.sql';
  RAISE;
END $$;
