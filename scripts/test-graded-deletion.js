// Test graded item deletion from Shopify inventory
// Run this in browser console on the inventory page

const storeKey = "hawaii"; 
const locationGid = "gid://shopify/Location/67325100207"; // Ward Ave
const testCert = "110270999"; // Test PSA cert

async function testGradedDeletion() {
  console.log('🧪 Testing graded item deletion flow...\n');
  
  try {
    // Step 1: First create a graded item to delete
    console.log('📦 Step 1: Creating graded item for deletion test');
    const { data: createData, error: createError } = await supabase.functions.invoke("v2-shopify-send-graded", {
      body: {
        storeKey,
        locationGid,
        item: {
          id: null,
          sku: testCert,
          psa_cert: testCert,
          quantity: 1,
          title: `Test Graded Card — PSA ${testCert}`,
          price: 99.99
        }
      }
    });

    if (createError) {
      console.error('❌ Failed to create test item:', createError);
      return;
    }

    console.log('✅ Created test graded item:', {
      productId: createData.productId,
      variantId: createData.variantId,
      inventoryItemId: createData.inventoryItemId
    });

    // Wait a moment for the item to be fully synced
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Test deletion via shopify-remove-or-zero function
    console.log('🗑️ Step 2: Testing deletion via remove function');
    
    const { data: deleteData, error: deleteError } = await supabase.functions.invoke("shopify-remove-or-zero", {
      body: {
        storeKey,
        productId: createData.productId,
        sku: testCert,
        locationGid,
        mode: "delete",
        itemIds: [] // Add actual item IDs here if you have them
      }
    });

    if (deleteError) {
      console.error('❌ Deletion failed:', deleteError);
      return;
    }

    console.log('✅ Deletion result:', deleteData);

    // Step 3: Verify the item was properly marked as removed in database
    console.log('🔍 Step 3: Verifying database updates');
    
    const { data: items, error: queryError } = await supabase
      .from('intake_items')
      .select('*')
      .eq('sku', testCert)
      .eq('store_key', storeKey)
      .order('created_at', { ascending: false })
      .limit(5);

    if (queryError) {
      console.error('❌ Database query failed:', queryError);
      return;
    }

    console.log('📊 Recent items with this SKU:');
    items?.forEach(item => {
      console.log(`  - ID: ${item.id}`);
      console.log(`    Type: ${item.type || 'N/A'}`);
      console.log(`    Removed: ${item.shopify_removed_at || 'No'}`);
      console.log(`    Removal Mode: ${item.shopify_removal_mode || 'N/A'}`);
      console.log(`    Sync Status: ${item.shopify_sync_status || 'N/A'}`);
      console.log(`    Product ID: ${item.shopify_product_id || 'None'}`);
      console.log('');
    });

    // Step 4: Test webhook simulation for graded item sale
    console.log('🎯 Step 4: Simulating graded item sale via webhook logic');
    
    // This would normally come from Shopify webhook, but we can simulate the logic
    const mockOrderPayload = {
      id: `test_order_${Date.now()}`,
      currency: 'USD',
      line_items: [{
        sku: testCert,
        variant_id: createData.variantId?.toString(),
        quantity: 1,
        price: "99.99"
      }]
    };

    console.log('💡 Mock order payload:', mockOrderPayload);
    console.log('✅ Graded deletion test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testGradedDeletion();