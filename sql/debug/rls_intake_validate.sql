-- SQL Smoke Test: Manual RLS and Intake Validation
-- Run this to quickly verify access control and RLS policies work correctly
-- 
-- Prerequisites: 
-- 1. Be logged in as a staff user in Supabase SQL Editor
-- 2. Have store/location assignments configured
-- 3. auth.uid() should return your user ID

-- ==============================================================================
-- 1. Test user access functions directly
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 TESTING ACCESS CONTROL FUNCTIONS';
    RAISE NOTICE '=====================================';
END
$$;

-- Test the core access function
SELECT 
    'user_can_access_store_location' as test_name,
    public.user_can_access_store_location(
        _user_id := auth.uid(), 
        _store_key := 'las_vegas', 
        _location_gid := 'gid://shopify/Location/82751193319'
    ) as result,
    CASE 
        WHEN public.user_can_access_store_location(
            _user_id := auth.uid(), 
            _store_key := 'las_vegas', 
            _location_gid := 'gid://shopify/Location/82751193319'
        ) THEN '✅ PASS: User has access'
        ELSE '❌ FAIL: User denied access'
    END as status;

-- Test the diagnostic function (returns JSON with all details)
SELECT 
    'debug_eval_intake_access' as test_name,
    public.debug_eval_intake_access(
        auth.uid(), 
        'las_vegas', 
        'gid://shopify/Location/82751193319'
    ) as result;

-- ==============================================================================
-- 2. Test RLS policies with dummy transaction (safe rollback)
-- ==============================================================================

DO $$
DECLARE
    current_user_id uuid;
    test_result record;
    dummy_item_id uuid;
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    
    RAISE NOTICE '';
    RAISE NOTICE '🧪 TESTING RLS POLICIES WITH DUMMY INSERT';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Current user ID: %', current_user_id;
    
    -- Start transaction for safe testing
    BEGIN
        RAISE NOTICE 'Starting test transaction (will rollback)...';
        
        -- Attempt dummy insert (this tests RLS INSERT policy)
        INSERT INTO public.intake_items (
            store_key,
            shopify_location_gid,
            quantity,
            brand_title,
            subject,
            category,
            variant,
            card_number,
            grade,
            price,
            cost,
            sku,
            source_provider,
            processing_notes
        ) VALUES (
            'las_vegas',
            'gid://shopify/Location/82751193319',
            1,
            'Test Card Brand',
            'Test Card Subject',
            'Test Category',
            'normal',
            'TEST-001',
            'near_mint',
            99.99,
            50.00,
            'TEST-SKU-SMOKE-' || extract(epoch from now())::text,
            'smoke_test',
            'SQL smoke test - will be rolled back'
        ) RETURNING id INTO dummy_item_id;
        
        RAISE NOTICE '✅ INSERT SUCCESS: Dummy item created with ID %', dummy_item_id;
        RAISE NOTICE '   This means RLS INSERT policy allows the operation';
        
        -- Test SELECT access (RLS SELECT policy)
        SELECT lot_number, brand_title, price 
        INTO test_result 
        FROM public.intake_items 
        WHERE id = dummy_item_id;
        
        RAISE NOTICE '✅ SELECT SUCCESS: Can read back the inserted item';
        RAISE NOTICE '   Lot: %, Brand: %, Price: %', 
                     test_result.lot_number, 
                     test_result.brand_title, 
                     test_result.price;
        
        -- Rollback the transaction (cleanup)
        RAISE NOTICE 'Rolling back transaction to clean up test data...';
        ROLLBACK;
        
    EXCEPTION 
        WHEN OTHERS THEN
            RAISE NOTICE '❌ RLS POLICY VIOLATION: %', SQLERRM;
            RAISE NOTICE '   This indicates access is properly denied by RLS';
            RAISE NOTICE '   Check user assignments and roles';
            ROLLBACK;
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE '🏁 SMOKE TEST COMPLETED';
    RAISE NOTICE '========================';
    
END
$$;

-- ==============================================================================
-- 3. Additional diagnostic queries
-- ==============================================================================

-- Show current user info
SELECT 
    'current_user_info' as info_type,
    auth.uid() as user_id,
    auth.role() as role,
    (auth.uid()::text) like '%-%-%-%-%' as uuid_format_valid;

-- Show user roles
SELECT 
    'user_roles' as info_type,
    ur.role,
    ur.created_at
FROM public.user_roles ur 
WHERE ur.user_id = auth.uid()
ORDER BY ur.created_at DESC;

-- Show user store assignments
SELECT 
    'store_assignments' as info_type,
    usa.store_key,
    usa.location_gid,
    usa.location_name,
    usa.is_default,
    ss.name as store_name
FROM public.user_shopify_assignments usa
LEFT JOIN public.shopify_stores ss ON ss.key = usa.store_key
WHERE usa.user_id = auth.uid()
ORDER BY usa.store_key, usa.location_name;

-- Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📋 SMOKE TEST SUMMARY';
    RAISE NOTICE '=====================';
    RAISE NOTICE '1. Run user_can_access_store_location() - should return TRUE';
    RAISE NOTICE '2. Run debug_eval_intake_access() - should show has_staff=true, can_access_location=true';
    RAISE NOTICE '3. Test RLS INSERT - should succeed and rollback cleanly';
    RAISE NOTICE '4. If any step fails, check user roles and store assignments';
    RAISE NOTICE '';
    RAISE NOTICE '✅ If all tests pass: Intake access control is working correctly';
    RAISE NOTICE '❌ If tests fail: Check user setup in admin panel';
    RAISE NOTICE '';
END
$$;