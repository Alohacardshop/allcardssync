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

interface TransferResult {
  item_id: string;
  success: boolean;
  error?: string;
  before_source_qty?: number;
  after_source_qty?: number;
  before_dest_qty?: number;
  after_dest_qty?: number;
}

async function getShopifyInventoryLevel(
  domain: string,
  token: string,
  inventoryItemId: string,
  locationId: string,
  apiVersion: string
): Promise<number | null> {
  try {
    const response = await fetch(
      `https://${domain}/admin/api/${apiVersion}/inventory_levels.json?inventory_item_ids=${inventoryItemId}&location_ids=${locationId}`,
      {
        headers: { 'X-Shopify-Access-Token': token },
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const level = data.inventory_levels?.[0];
    return level?.available ?? null;
  } catch {
    return null;
  }
}

async function setShopifyInventoryLevel(
  domain: string,
  token: string,
  inventoryItemId: string,
  locationId: string,
  available: number,
  apiVersion: string
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(
      `https://${domain}/admin/api/${apiVersion}/inventory_levels/set.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available,
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Shopify error ${response.status}: ${text}` };
    }
    
    return { ok: true };
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'Request timed out after 30 seconds' };
    }
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function writeAuditEntry(
  supabase: any,
  action: string,
  tableName: string,
  recordId: string,
  userId: string,
  userEmail: string,
  oldData: any,
  newData: any,
  locationGid: string
) {
  try {
    await supabase.from('audit_log').insert({
      action,
      table_name: tableName,
      record_id: recordId,
      user_id: userId,
      user_email: userEmail,
      old_data: oldData,
      new_data: newData,
      location_gid: locationGid,
    });
  } catch (e) {
    console.error('Failed to write audit entry:', e);
  }
}

async function updateInventoryLevelsOptimistic(
  supabase: any,
  storeKey: string,
  inventoryItemId: string,
  sourceLocationGid: string,
  destLocationGid: string,
  quantity: number,
  beforeSourceQty: number,
  beforeDestQty: number
) {
  // Update source location (decrement)
  await supabase
    .from('shopify_inventory_levels')
    .upsert({
      store_key: storeKey,
      inventory_item_id: inventoryItemId,
      location_gid: sourceLocationGid,
      available: Math.max(0, beforeSourceQty - quantity),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'store_key,inventory_item_id,location_gid'
    });
  
  // Update destination location (increment)
  await supabase
    .from('shopify_inventory_levels')
    .upsert({
      store_key: storeKey,
      inventory_item_id: inventoryItemId,
      location_gid: destLocationGid,
      available: beforeDestQty + quantity,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'store_key,inventory_item_id,location_gid'
    });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    
    if (authError || !user) {
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
    const apiVersion = domainData?.api_version || '2024-07';

    const sourceLocationId = source_location_gid.split('/').pop()!;
    const destLocationId = destination_location_gid.split('/').pop()!;

    let successCount = 0;
    let failCount = 0;
    const results: TransferResult[] = [];

    // Process each item
    for (const item of items) {
      const itemName = `${item.brand_title || ''} ${item.subject || ''} ${item.card_number || ''}`.trim();
      const result: TransferResult = { item_id: item.id, success: false };
      
      try {
        // Pre-flight check: verify source has sufficient inventory
        if (shopifyToken && shopifyDomain && item.shopify_inventory_item_id) {
          const sourceQty = await getShopifyInventoryLevel(
            shopifyDomain,
            shopifyToken,
            item.shopify_inventory_item_id,
            sourceLocationId,
            apiVersion
          );
          
          const destQty = await getShopifyInventoryLevel(
            shopifyDomain,
            shopifyToken,
            item.shopify_inventory_item_id,
            destLocationId,
            apiVersion
          ) ?? 0;

          result.before_source_qty = sourceQty ?? 0;
          result.before_dest_qty = destQty;

          // CRITICAL: Prevent negative inventory
          if (sourceQty === null || sourceQty < item.quantity) {
            throw new Error(`Insufficient inventory at source: have ${sourceQty ?? 0}, need ${item.quantity}`);
          }

          // Optimistically update our local inventory_levels table
          await updateInventoryLevelsOptimistic(
            supabase,
            store_key,
            item.shopify_inventory_item_id,
            source_location_gid,
            destination_location_gid,
            item.quantity,
            sourceQty,
            destQty
          );

          // Set source to 0 (for 1-of-1 items) or decrement
          const newSourceQty = sourceQty - item.quantity;
          const setSourceResult = await setShopifyInventoryLevel(
            shopifyDomain,
            shopifyToken,
            item.shopify_inventory_item_id,
            sourceLocationId,
            newSourceQty,
            apiVersion
          );

          if (!setSourceResult.ok) {
            throw new Error(`Failed to set source inventory: ${setSourceResult.error}`);
          }

          // Set destination with incremented quantity
          const newDestQty = destQty + item.quantity;
          const setDestResult = await setShopifyInventoryLevel(
            shopifyDomain,
            shopifyToken,
            item.shopify_inventory_item_id,
            destLocationId,
            newDestQty,
            apiVersion
          );

          if (!setDestResult.ok) {
            // Rollback source
            console.log(`⚠️ Rolling back source inventory for item ${item.id}`);
            await setShopifyInventoryLevel(
              shopifyDomain,
              shopifyToken,
              item.shopify_inventory_item_id,
              sourceLocationId,
              sourceQty,
              apiVersion
            );
            throw new Error(`Failed to set destination inventory: ${setDestResult.error}`);
          }

          result.after_source_qty = newSourceQty;
          result.after_dest_qty = newDestQty;

          console.log(`✅ Shopify inventory updated: source ${sourceQty}→${newSourceQty}, dest ${destQty}→${newDestQty}`);
        }

        // Update intake_items location
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({ 
            shopify_location_gid: destination_location_gid,
            last_shopify_location_gid: destination_location_gid,
            updated_at: new Date().toISOString(),
            updated_by: user.id
          })
          .eq('id', item.id);

        if (updateError) throw updateError;

        // Update cards table if this is a 1-of-1 card
        if (item.sku) {
          await supabase
            .from('cards')
            .update({
              current_shopify_location_id: destination_location_gid,
              updated_at: new Date().toISOString()
            })
            .eq('sku', item.sku);
        }

        // Write audit entry
        await writeAuditEntry(
          supabase,
          'LOCATION_TRANSFER',
          'intake_items',
          item.id,
          user.id,
          user.email || '',
          {
            shopify_location_gid: source_location_gid,
            quantity_at_source: result.before_source_qty,
          },
          {
            shopify_location_gid: destination_location_gid,
            quantity_at_source: result.after_source_qty,
            quantity_at_dest: result.after_dest_qty,
          },
          destination_location_gid
        );

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

        result.success = true;
        results.push(result);
        successCount++;
        console.log(`✅ Item ${item.id} transferred successfully`);

      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error';
        results.push(result);
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
          error_message: result.error,
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
        results,
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