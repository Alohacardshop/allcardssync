import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Sample payloads for each webhook type
    const testPayloads = {
      'inventory_levels/update': {
        id: 123456789,
        inventory_item_id: 987654321,
        location_id: 67325100207,
        available: 5,
        updated_at: new Date().toISOString()
      },
      'orders/paid': {
        id: 555666777,
        line_items: [
          {
            id: 111222333,
            product_id: 888999000,
            variant_id: 444555666,
            sku: "TEST-SKU-001",
            quantity: 1
          }
        ],
        financial_status: "paid",
        fulfillment_status: null
      },
      'orders/cancelled': {
        id: 555666778,
        line_items: [
          {
            id: 111222334,
            product_id: 888999001,
            variant_id: 444555667,
            sku: "TEST-SKU-002",
            quantity: 2
          }
        ],
        cancelled_at: new Date().toISOString(),
        cancel_reason: "customer"
      },
      'refunds/create': {
        id: 777888999,
        order_id: 555666777,
        refund_line_items: [
          {
            line_item_id: 111222333,
            quantity: 1,
            line_item: {
              product_id: 888999000,
              variant_id: 444555666,
              sku: "TEST-SKU-001"
            }
          }
        ],
        created_at: new Date().toISOString()
      },
      'products/update': {
        id: 888999000,
        title: "Updated Test Product",
        handle: "updated-test-product",
        variants: [
          {
            id: 444555666,
            inventory_item_id: 987654321,
            sku: "TEST-SKU-001",
            inventory_quantity: 3
          }
        ],
        updated_at: new Date().toISOString()
      },
      'products/delete': {
        id: 888999002,
        title: "Deleted Test Product",
        handle: "deleted-test-product"
      }
    };

    const webhookUrl = 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-webhook';
    const testResults: any[] = [];

    // Test each webhook type
    for (const [topic, payload] of Object.entries(testPayloads)) {
      console.log(`Testing webhook: ${topic}`);
      
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Topic': topic,
            'X-Shopify-Shop-Domain': 'aloha-card-shop-test.myshopify.com'
          },
          body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        
        testResults.push({
          topic,
          status: response.status,
          success: response.ok,
          response: responseText,
          payload: payload
        });

        console.log(`${topic}: ${response.status} - ${response.ok ? 'SUCCESS' : 'FAILED'}`);
      } catch (error) {
        testResults.push({
          topic,
          status: 'ERROR',
          success: false,
          error: error.message,
          payload: payload
        });
        console.error(`${topic}: ERROR - ${error.message}`);
      }
    }

    // Summary
    const successful = testResults.filter(r => r.success).length;
    const failed = testResults.filter(r => !r.success).length;

    const summary = {
      total_tests: testResults.length,
      successful: successful,
      failed: failed,
      success_rate: `${Math.round((successful / testResults.length) * 100)}%`,
      results: testResults
    };

    console.log(`\n=== WEBHOOK TEST SUMMARY ===`);
    console.log(`Total Tests: ${summary.total_tests}`);
    console.log(`Successful: ${summary.successful}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Success Rate: ${summary.success_rate}`);

    return new Response(JSON.stringify(summary, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Test runner error:', error);
    return new Response(JSON.stringify({ 
      error: 'Test runner failed', 
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});