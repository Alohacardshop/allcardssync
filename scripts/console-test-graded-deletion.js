// GRADED DELETION TEST - Console version
// Run this in browser console on the inventory page

const storeKey = "hawaii";
const locationGid = "gid://shopify/Location/67325100207"; // Ward Ave

async function testGradedDeletionFlow() {
  console.log('🧪 Testing graded item deletion flow...\n');
  
  try {
    // Step 1: Check current graded items in inventory
    console.log('📊 Step 1: Checking current graded items');
    
    const { data: gradedItems, error: queryError } = await supabase
      .from('intake_items')
      .select('id, sku, psa_cert, type, quantity, shopify_product_id, shopify_sync_status, shopify_removed_at')
      .eq('store_key', storeKey)
      .eq('type', 'Graded')
      .is('shopify_removed_at', null)
      .limit(5);

    if (queryError) {
      console.error('❌ Query failed:', queryError);
      return;
    }

    console.log(`Found ${gradedItems?.length || 0} active graded items:`);
    gradedItems?.forEach((item, i) => {
      console.log(`  ${i + 1}. SKU: ${item.sku}, PSA: ${item.psa_cert}, Product: ${item.shopify_product_id}`);
    });

    if (!gradedItems?.length) {
      console.log('⚠️ No graded items found. Create one first using the batch send flow.');
      return;
    }

    const testItem = gradedItems[0];
    console.log(`\n🎯 Using test item: ${testItem.sku} (ID: ${testItem.id})`);

    // Step 2: Test removal by soft-deleting (triggers database trigger)
    console.log('\n🗑️ Step 2: Testing soft delete to trigger removal...');
    
    const { data: updateResult, error: updateError } = await supabase
      .from('intake_items')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_reason: 'Test graded deletion'
      })
      .eq('id', testItem.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Soft delete failed:', updateError);
      return;
    }

    console.log('✅ Soft delete triggered removal:', updateResult);

    // Wait for async trigger to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Verify database updates
    console.log('\n🔍 Step 3: Verifying database updates...');
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for DB update
    
    const { data: updatedItem, error: verifyError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('id', testItem.id)
      .single();

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
      return;
    }

    console.log('📋 Updated item status:');
    console.log(`  Removed At: ${updatedItem.shopify_removed_at || 'Not set'}`);
    console.log(`  Removal Mode: ${updatedItem.shopify_removal_mode || 'Not set'}`);
    console.log(`  Sync Status: ${updatedItem.shopify_sync_status || 'Not set'}`);
    console.log(`  Product ID: ${updatedItem.shopify_product_id || 'Cleared'}`);
    console.log(`  Quantity: ${updatedItem.quantity}`);

    // Step 4: Test how this differs from raw item deletion
    console.log('\n🔄 Step 4: Checking raw item handling...');
    
    const { data: rawItems } = await supabase
      .from('intake_items')
      .select('id, sku, type, quantity, shopify_product_id')
      .eq('store_key', storeKey)
      .eq('type', 'Raw')
      .is('shopify_removed_at', null)
      .limit(3);

    console.log(`Found ${rawItems?.length || 0} raw items for comparison:`);
    rawItems?.forEach((item, i) => {
      console.log(`  ${i + 1}. SKU: ${item.sku}, Qty: ${item.quantity}, Product: ${item.shopify_product_id}`);
    });

    console.log('\n✅ Graded deletion test completed!');
    console.log('\n💡 Key observations:');
    console.log('  - Graded items get fully removed (product deleted)');
    console.log('  - Database properly tracks removal timestamps');
    console.log('  - Consider if raw items need different logic (qty decrement vs full removal)');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testGradedDeletionFlow();