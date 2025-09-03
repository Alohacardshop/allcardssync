import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { fetchWithRetry } from "../_shared/http.ts";

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
      gradedTags = ["graded", "Professional Sports Authenticator (PSA)", "PSA"],
      rawTags = ["single"],
      updatedSince,
      maxPages = 50,
      dryRun = false,
      status = 'active'
    } = await req.json();

    if (!storeKey) {
      return new Response(
        JSON.stringify({ error: 'storeKey is required' }), 
        { status: 400, headers: corsHeaders }
      );
    }

    // Normalize date to ISO8601 if provided
    const updatedSinceIso = updatedSince ? new Date(updatedSince).toISOString() : undefined;

    console.log(`Starting Shopify product import for store: ${storeKey}`);
    console.log(`Graded tags: ${JSON.stringify(gradedTags)}`);
    console.log(`Raw tags: ${JSON.stringify(rawTags)}`);

    // Use service client already created above for auth check
    const supabase = authClient;

    // Get Shopify credentials (support multiple key formats for compatibility)
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
          // Check product tags to determine type
          const productTags = (product.tags || '').toLowerCase();
          const isGraded = gradedTags.some(tag => productTags.includes(tag.toLowerCase()));
          const isRaw = rawTags.some(tag => productTags.includes(tag.toLowerCase()));
          
          // Skip products that don't match either category
          if (!isGraded && !isRaw) {
            continue;
          }

          const productType = isGraded ? 'graded' : 'raw';
          if (productType === 'graded') gradedProducts++;
          else rawProducts++;

          // Get product image URLs
          const imageUrls = product.images?.map((img: any) => img.src) || [];

          // Process each variant
          for (const variant of product.variants || []) {
            totalVariants++;

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

            // Create/update intake_items for each location (or one row if no locations)
            const locationsToProcess = inventoryLevels.length > 0 
              ? inventoryLevels 
              : [{ location_id: null, available: 0 }];

            for (const level of locationsToProcess) {
              const locationGid = level.location_id ? `gid://shopify/Location/${level.location_id}` : null;
              const quantity = level.available || 0;

              // Build comprehensive title
              const title = [
                product.title,
                variant.title !== 'Default Title' ? variant.title : null
              ].filter(Boolean).join(' - ');

              // Upsert intake_items
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
                    tags: product.tags
                  },
                  removed_from_batch_at: quantity > 0 ? new Date().toISOString() : null,
                }, {
                  onConflict: 'store_key,sku,shopify_location_gid',
                  ignoreDuplicates: false
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

    const result = {
      success: true,
      dryRun,
      statistics: {
        totalProducts,
        gradedProducts,
        rawProducts,
        totalVariants,
        upsertedRows,
        pagesProcessed: pageCount,
        errors: errors.slice(0, 10) // Limit error array size
      }
    };

    console.log('Import completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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