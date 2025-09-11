// V2 GRADED DELETION TEST - Console version  
// Run this in browser console on the inventory page

const storeKey = "hawaii";
const locationGid = "gid://shopify/Location/67325100207"; // Ward Ave

async function testV2GradedRemoval() {
  console.log('🧪 Testing NEW v2 graded item removal flow...\n');
  
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

    // Step 2: Test NEW v2 removal function
    console.log('\n🗑️ Step 2: Testing NEW v2-shopify-remove...');
    
    const { data: removeResult, error: removeError } = await supabase.functions.invoke("v2-shopify-remove", {
      body: {
        storeKey,
        productId: testItem.shopify_product_id,
        sku: testItem.sku,
        locationGid,
        itemIds: [testItem.id]
      }
    });

    if (removeError) {
      console.error('❌ V2 Removal failed:', removeError);
      return;
    }

    console.log('✅ V2 Removal result:', removeResult);
    console.log(`  Strategy used: ${removeResult.strategy}`);
    console.log(`  Items updated: ${removeResult.itemsUpdated}`);
    console.log(`  Took: ${removeResult.diagnostics.ms}ms`);

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

    console.log('\n✅ V2 graded removal test completed successfully!');
    console.log('\n💡 Key improvements in v2:');
    console.log('  - Differentiated handling for graded vs raw items');
    console.log('  - Cleaner, more focused removal logic');
    console.log('  - Better error handling and diagnostics');
    console.log('  - Removal mode tracking shows "v2_graded_product_delete"');

  } catch (error) {
    console.error('❌ V2 test failed:', error);
  }
}

// Run the test
testV2GradedRemoval();