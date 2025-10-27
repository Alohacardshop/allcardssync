import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransferRequest {
  transfer_id: string;
  item_ids: string[];
  source_location_gid: string;
  destination_location_gid: string;
  store_key: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // JWT validation for mutating endpoint
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('❌ Missing or invalid Authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    // Verify JWT token
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ Invalid JWT token:', authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('✅ Authenticated user:', user.id);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { transfer_id, item_ids, source_location_gid, destination_location_gid, store_key } =
      await req.json() as TransferRequest;

    console.log(`🔄 Starting bulk transfer ${transfer_id} for ${item_ids.length} items`);

    // Fetch items to transfer
    const { data: items, error: fetchError } = await supabase
      .from('intake_items')
      .select('id, sku, brand_title, subject, card_number, quantity, shopify_product_id, shopify_variant_id, shopify_inventory_item_id')
      .in('id', item_ids)
      .eq('shopify_location_gid', source_location_gid)
      .is('deleted_at', null);

    if (fetchError) throw fetchError;

    if (!items || items.length === 0) {
      throw new Error('No valid items found at source location');
    }

    console.log(`✅ Found ${items.length} items to transfer`);

    let successCount = 0;
    let failCount = 0;

    // Get Shopify credentials
    const { data: storeData } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_ADMIN_TOKEN_${store_key}`)
      .single();

    const shopifyToken = storeData?.key_value;

    const { data: domainData } = await supabase
      .from('shopify_stores')
      .select('domain, api_version')
      .eq('key', store_key)
      .single();

    const shopifyDomain = domainData?.domain;
    const apiVersion = domainData?.api_version || '2024-01';

    // Process each item
    for (const item of items) {
      const itemName = `${item.brand_title || ''} ${item.subject || ''} ${item.card_number || ''}`.trim();
      
      try {
        // Update Shopify inventory if we have the necessary IDs
        if (shopifyToken && shopifyDomain && item.shopify_inventory_item_id) {
          // Get location IDs (numeric)
          const sourceLocationId = source_location_gid.split('/').pop();
          const destLocationId = destination_location_gid.split('/').pop();

          let sourceInventorySet = false;

          try {
            // Set source location inventory to 0 with timeout
            const setZeroController = new AbortController();
            const setZeroTimeout = setTimeout(() => setZeroController.abort(), 30000); // 30s timeout

            const setZeroResponse = await fetch(
              `https://${shopifyDomain}/admin/api/${apiVersion}/inventory_levels/set.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': shopifyToken,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  location_id: sourceLocationId,
                  inventory_item_id: item.shopify_inventory_item_id,
                  available: 0,
                }),
                signal: setZeroController.signal,
              }
            );
            clearTimeout(setZeroTimeout);

            if (!setZeroResponse.ok) {
              throw new Error(`Failed to set source inventory to 0: ${setZeroResponse.statusText}`);
            }
            sourceInventorySet = true;

            // Set destination location inventory with timeout
            const setDestController = new AbortController();
            const setDestTimeout = setTimeout(() => setDestController.abort(), 30000); // 30s timeout

            const setDestResponse = await fetch(
              `https://${shopifyDomain}/admin/api/${apiVersion}/inventory_levels/set.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': shopifyToken,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  location_id: destLocationId,
                  inventory_item_id: item.shopify_inventory_item_id,
                  available: item.quantity,
                }),
                signal: setDestController.signal,
              }
            );
            clearTimeout(setDestTimeout);

            if (!setDestResponse.ok) {
              // Rollback: restore source inventory if destination fails
              if (sourceInventorySet) {
                console.log(`⚠️ Rolling back source inventory for item ${item.id}`);
                const rollbackController = new AbortController();
                const rollbackTimeout = setTimeout(() => rollbackController.abort(), 30000);
                
                await fetch(
                  `https://${shopifyDomain}/admin/api/${apiVersion}/inventory_levels/set.json`,
                  {
                    method: 'POST',
                    headers: {
                      'X-Shopify-Access-Token': shopifyToken,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      location_id: sourceLocationId,
                      inventory_item_id: item.shopify_inventory_item_id,
                      available: item.quantity,
                    }),
                    signal: rollbackController.signal,
                  }
                );
                clearTimeout(rollbackTimeout);
              }
              throw new Error(`Failed to set destination inventory: ${setDestResponse.statusText}`);
            }

            console.log(`✅ Shopify inventory updated for item ${item.id}`);
          } catch (fetchError) {
            // Handle timeout or network errors
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
              throw new Error('Shopify API request timed out after 30 seconds');
            }
            throw fetchError;
          }
        }

        // Update intake_items location
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({ 
            shopify_location_gid: destination_location_gid,
            updated_at: new Date().toISOString(),
            updated_by: 'bulk_transfer'
          })
          .eq('id', item.id);

        if (updateError) throw updateError;

        // Log success
        await supabase.from('location_transfer_items').insert({
          transfer_id,
          intake_item_id: item.id,
          sku: item.sku || '',
          item_name: itemName,
          quantity: item.quantity,
          status: 'success',
          shopify_product_id: item.shopify_product_id,
          shopify_variant_id: item.shopify_variant_id,
          processed_at: new Date().toISOString(),
        });

        successCount++;
        console.log(`✅ Item ${item.id} transferred successfully`);

      } catch (error) {
        failCount++;
        console.error(`❌ Failed to transfer item ${item.id}:`, error);

        await supabase.from('location_transfer_items').insert({
          transfer_id,
          intake_item_id: item.id,
          sku: item.sku || '',
          item_name: itemName,
          quantity: item.quantity,
          status: 'failed',
          shopify_product_id: item.shopify_product_id,
          shopify_variant_id: item.shopify_variant_id,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          processed_at: new Date().toISOString(),
        });
      }
    }

    // Update transfer record
    await supabase
      .from('location_transfers')
      .update({
        successful_items: successCount,
        failed_items: failCount,
        status: failCount === 0 ? 'completed' : 'partial',
        completed_at: new Date().toISOString(),
      })
      .eq('id', transfer_id);

    console.log(`🎯 Transfer complete: ${successCount} succeeded, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        total: items.length,
        successful: successCount,
        failed: failCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Transfer error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
