-- Create a test function to debug the lot creation issue for Dorian
CREATE OR REPLACE FUNCTION debug_lot_creation_for_dorian()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  dorian_user_id uuid;
  test_lot_id uuid;
  debug_info jsonb;
BEGIN
  -- Get Dorian's user ID
  SELECT id INTO dorian_user_id FROM auth.users WHERE email = 'dorian@alohacardshop.com';
  
  -- Test lot creation
  INSERT INTO intake_lots (
    id,
    lot_number,
    lot_type,
    total_items,
    total_value,
    status,
    store_key,
    shopify_location_gid,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    'DEBUG-TEST-' || extract(epoch from now())::text,
    'mixed',
    0,
    0,
    'active',
    'las_vegas',
    'gid://shopify/Location/82751193319',
    dorian_user_id,
    now(),
    now()
  ) RETURNING id INTO test_lot_id;
  
  -- Return debug info
  debug_info := jsonb_build_object(
    'success', true,
    'dorian_user_id', dorian_user_id,
    'test_lot_id', test_lot_id,
    'has_staff_role', has_role(dorian_user_id, 'staff'::app_role),
    'has_location_access', user_can_access_store_location(dorian_user_id, 'las_vegas', 'gid://shopify/Location/82751193319')
  );
  
  -- Clean up test lot
  DELETE FROM intake_lots WHERE id = test_lot_id;
  
  RETURN debug_info;
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE,
    'dorian_user_id', dorian_user_id
  );
END;
$$;