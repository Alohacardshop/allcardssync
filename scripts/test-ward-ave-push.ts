// PROMPT B - Fresh push test (Ward Ave)
// Test script to push graded items to Ward Ave location

import { supabase } from '@/integrations/supabase/client';

const storeKey = "hawaii";
const locationGid = "gid://shopify/Location/67325100207"; // Ward Ave
const certs = ["110270999"]; // Add more certs as needed

async function testWardAvePush() {
  console.log('🔄 Testing graded push to Ward Ave...\n');
  
  for (const cert of certs) {
    console.log(`📦 Processing PSA cert: ${cert}`);
    
    try {
      const response = await supabase.functions.invoke("v2-shopify-send-graded", {
        body: {
          storeKey,
          locationGid,
          item: {
            id: null,          // or your row id if present
            sku: cert,         // SKU can be cert or cert+, both OK
            psa_cert: cert,    // <- barcode MUST equal this
            quantity: 1,
            title: `Graded Card — PSA ${cert}`,
            price: 99.99
          }
        }
      });

      if (response.error) {
        console.error(`❌ Error for ${cert}:`, response.error);
        continue;
      }

      const data = response.data;
      console.log(`✅ [${cert}] ${data.decision} productId:${data.productId} variantId:${data.variantId} inventoryItemId:${data.inventoryItemId}`);
      console.log(`   📱 Product: ${data.productAdminUrl}`);
      console.log(`   🏷️  Variant: ${data.variantAdminUrl}`);
      console.log(`   📊 Enforced barcode: ${data.enforcedBarcode}\n`);
      
    } catch (error) {
      console.error(`❌ Exception for ${cert}:`, error);
    }
  }
  
  console.log('✅ Test complete!');
}

// Run the test
testWardAvePush().catch(console.error);