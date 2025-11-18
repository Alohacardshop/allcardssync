import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { fetchWithRetry } from "../_shared/http.ts";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authentication and admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create service client for auth check
    const authClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT token
    const { data: { user }, error: userError } = await authClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has admin role
    const { data: roleData } = await authClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { 
      storeKey, 
      gradedTags = ["graded", "PSA"],
      rawTags = ["single"],
      updatedSince,
      maxPages = 50,
      dryRun = false,
      status = 'active',
      skipAlreadyPulled = true
    } = await req.json();

    if (!storeKey) {
      return new Response(
        JSON.stringify({ error: 'storeKey is required' }), 
        { status: 400, headers: corsHeaders }
      );
    }

    // Use service client already created above for auth check
    const supabase = authClient;

    // If skipAlreadyPulled is true and no updatedSince provided, get last pull time
    let updatedSinceIso: string | undefined;
    if (skipAlreadyPulled && !updatedSince) {
      const { data: lastPullSetting } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', `SHOPIFY_LAST_PULL_${storeKey.toUpperCase()}`)
        .single();
      
      if (lastPullSetting?.key_value) {
        updatedSinceIso = lastPullSetting.key_value as string;
        console.log(`Using last pull time for incremental sync: ${updatedSinceIso}`);
      }
    } else if (updatedSince) {
      updatedSinceIso = new Date(updatedSince).toISOString();
    }

    console.log(`Starting Shopify product import for store: ${storeKey}`);
    console.log(`Graded tags: ${JSON.stringify(gradedTags)}`);
    console.log(`Raw tags: ${JSON.stringify(rawTags)}`);
    console.log(`Skip already pulled: ${skipAlreadyPulled}, Updated since: ${updatedSinceIso || 'none'}`);

    // Return immediately and process in background
    const response = new Response(
      JSON.stringify({
        success: true,
        message: 'Backfill started in background',
        storeKey,
        dryRun
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // Process backfill in background
    EdgeRuntime.waitUntil(
      (async () => {
        try {
          await processBackfill();
        } catch (error) {
          console.error('Background backfill error:', error);
        }
      })()
    );

    return response;

    async function processBackfill() {
    const upper = storeKey.toUpperCase();
    const domainKeys = [
      `SHOPIFY_${upper}_DOMAIN`,
      `SHOPIFY_STORE_DOMAIN_${storeKey}`,
      `SHOPIFY_${upper}_STORE_DOMAIN`,
    ];
    const tokenKeys = [
      `SHOPIFY_${upper}_ACCESS_TOKEN`,
      `SHOPIFY_ADMIN_ACCESS_TOKEN_${storeKey}`,
      `SHOPIFY_${upper}_ADMIN_ACCESS_TOKEN`,
    ];

    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('key_name,key_value')
      .in('key_name', [...domainKeys, ...tokenKeys]);

    if (settingsError) {
      console.error('Failed to read system_settings for Shopify credentials', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to read system settings for Shopify credentials' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const map = new Map<string, string>();
    (settings || []).forEach(s => map.set(s.key_name, s.key_value as string));
    const shopifyDomain = domainKeys.map(k => map.get(k)).find(Boolean);
    const accessToken = tokenKeys.map(k => map.get(k)).find(Boolean);

    if (!shopifyDomain || !accessToken) {
      console.error('Missing Shopify credentials', { tried: { domainKeys, tokenKeys }, found: Object.fromEntries(map) });
      return new Response(
        JSON.stringify({ error: 'Shopify credentials not found for store', tried: { domainKeys, tokenKeys } }), 
        { status: 400, headers: corsHeaders }
      );
    }

    const apiVersion = '2024-07';

    // Statistics
    let totalProducts = 0;
    let gradedProducts = 0;
    let rawProducts = 0;
    let totalVariants = 0;
    let skippedVariants = 0;
    let upsertedRows = 0;
    let errors: string[] = [];

    // Fetch products from Shopify with pagination (use full next link URL to avoid 400s)
    let pageCount = 0;
    
    // Cap preview pages to 3 for faster previews
    const effectiveMaxPages = dryRun ? Math.min(maxPages, 3) : maxPages;

    const initialUrlBase = `https://${shopifyDomain}/admin/api/${apiVersion}/products.json?limit=250`;
    const initialUrl =
      initialUrlBase +
      (status && status !== 'any' ? `&status=${encodeURIComponent(status)}` : '') +
      (updatedSinceIso ? `&updated_at_min=${encodeURIComponent(updatedSinceIso)}` : '');

    let currentUrl: string | null = initialUrl;

    while (currentUrl && pageCount < effectiveMaxPages) {
      pageCount++;
      
      console.log(`Fetching page ${pageCount}: ${currentUrl}`);

      const response = await fetchWithRetry(currentUrl, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = `Shopify API error: ${response.status} ${response.statusText}`;
        errors.push(error);
        break;
      }

      const data = await response.json();
      const products = data.products || [];

      if (products.length === 0) {
        console.log('No more products found');
        break;
      }

      totalProducts += products.length;

      // Process each product
      for (const product of products) {
        try {
          // Check product tags to determine type (but don't skip - pull everything)
          const productTags = (product.tags || '').toLowerCase();
          const isGraded = gradedTags.some(tag => productTags.includes(tag.toLowerCase()));
          const isRaw = rawTags.some(tag => productTags.includes(tag.toLowerCase()));
          
          // Categorize for statistics, but import all products
          const productType = isGraded ? 'graded' : (isRaw ? 'raw' : 'other');
          if (productType === 'graded') gradedProducts++;
          else if (productType === 'raw') rawProducts++;

          // Get product image URLs
          const imageUrls = product.images?.map((img: any) => img.src) || [];

          // Process each variant
          for (const variant of product.variants || []) {
            totalVariants++;

            // Skip variants without SKUs - they can't be properly tracked in inventory
            if (!variant.sku || variant.sku.trim() === '') {
              console.log(`Skipping variant ${variant.id} from product "${product.title}" - no SKU`);
              skippedVariants++;
              continue;
            }

            if (dryRun) continue;

            // Get inventory levels for this variant
            let inventoryLevels: any[] = [];
            if (variant.inventory_item_id && variant.inventory_item_id !== null && variant.inventory_item_id !== '') {
              try {
                const levelsUrl = `https://${shopifyDomain}/admin/api/${apiVersion}/inventory_levels.json?inventory_item_ids=${variant.inventory_item_id}`;
                console.log(`Fetching inventory levels for variant ${variant.id}, inventory_item_id: ${variant.inventory_item_id}`);
                
                const levelsResponse = await fetchWithRetry(levelsUrl, {
                  headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                  },
                });

                if (levelsResponse.ok) {
                  const levelsData = await levelsResponse.json();
                  inventoryLevels = levelsData.inventory_levels || [];
                } else {
                  const errorText = await levelsResponse.text();
                  console.error(`Inventory levels API error for variant ${variant.id}: ${levelsResponse.status} ${levelsResponse.statusText}`, errorText);
                  // Don't add to errors array for 400s as they're often due to invalid inventory item IDs
                  if (levelsResponse.status !== 400) {
                    errors.push(`Inventory levels API error for variant ${variant.id}: ${levelsResponse.status} ${levelsResponse.statusText}`);
                  }
                }
              } catch (e) {
                console.error(`Failed to fetch inventory levels for variant ${variant.id}:`, e);
                errors.push(`Failed to fetch inventory levels for variant ${variant.id}: ${e.message}`);
              }
            } else {
              console.log(`Skipping inventory levels for variant ${variant.id} - no valid inventory_item_id (${variant.inventory_item_id})`);
            }

            // Only process locations with actual inventory (location_id exists and quantity > 0)
            const locationsToProcess = inventoryLevels.filter(level => 
              level.location_id && level.available > 0
            );

            // Skip variant if no valid inventory locations
            if (locationsToProcess.length === 0) {
              console.log(`Skipping variant ${variant.id} (SKU: ${variant.sku}) - no locations with quantity > 0 (found ${inventoryLevels.length} locations total)`);
              skippedVariants++;
              continue;
            }

            console.log(`Processing variant ${variant.id} (SKU: ${variant.sku}): ${locationsToProcess.length} locations with inventory`);

            for (const level of locationsToProcess) {
              const locationGid = `gid://shopify/Location/${level.location_id}`;
              const quantity = level.available || 0;

              // Build comprehensive title
              const title = [
                product.title,
                variant.title !== 'Default Title' ? variant.title : null
              ].filter(Boolean).join(' - ');

              // Upsert intake_items - onConflict expects column names
              const { error: upsertError } = await supabase
                .from('intake_items')
                .upsert({
                  sku: variant.sku,
                  store_key: storeKey,
                  shopify_product_id: product.id.toString(),
                  shopify_variant_id: variant.id.toString(),
                  shopify_inventory_item_id: variant.inventory_item_id?.toString(),
                  shopify_location_gid: locationGid,
                  quantity,
                  price: parseFloat(variant.price) || 99999,
                  brand_title: title,
                  subject: product.title,
                  category: productType,
                  image_urls: imageUrls,
                  source_provider: 'shopify-pull',
                  shopify_snapshot: {
                    product_id: product.id,
                    variant_id: variant.id,
                    title: product.title,
                    variant_title: variant.title,
                    price: variant.price,
                    sku: variant.sku,
                    tags: typeof product.tags === 'string' 
                      ? product.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
                      : (product.tags || [])
                  },
                  removed_from_batch_at: quantity > 0 ? new Date().toISOString() : null,
                });

              if (upsertError) {
                console.error(`Upsert error for SKU ${variant.sku}:`, upsertError);
                errors.push(`Failed to upsert ${variant.sku}: ${upsertError.message}`);
              } else {
                upsertedRows++;
              }
            }
          }
        } catch (e) {
          console.error(`Error processing product ${product.id}:`, e);
          errors.push(`Product ${product.id}: ${e.message}`);
        }
      }

      // Check for next page (use full URL from Link header)
      const linkHeader = response.headers.get('link');
      let nextUrl: string | null = null;
      if (linkHeader) {
        const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = m ? m[1] : null;
      }

      if (!nextUrl) {
        console.log('No more pages available');
        break;
      }
      currentUrl = nextUrl;
    }

    // Update last pull timestamp on successful pull (not in dry run)
    if (!dryRun && upsertedRows > 0) {
      const pullTimestamp = new Date().toISOString();
      await supabase
        .from('system_settings')
        .upsert({
          key_name: `SHOPIFY_LAST_PULL_${storeKey.toUpperCase()}`,
          key_value: pullTimestamp,
          description: `Last successful Shopify product pull for ${storeKey}`,
          category: 'shopify'
        }, {
          onConflict: 'key_name'
        });
      console.log(`Updated last pull timestamp to: ${pullTimestamp}`);
    }

    const result = {
      success: true,
      dryRun,
      statistics: {
        totalProducts,
        gradedProducts,
        rawProducts,
        totalVariants,
        skippedVariants,
        upsertedRows,
        pagesProcessed: pageCount,
        updatedSince: updatedSinceIso,
        errors: errors.slice(0, 10) // Limit error array size
      }
    };

    console.log('Import completed:', result);
    } // End processBackfill

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error occurred',
        success: false 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});