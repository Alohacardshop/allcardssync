
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { items, storeKey } = await req.json();
    console.log(`Processing ${items.length} items for store ${storeKey}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Shopify credentials from system_settings - standardized naming with fallbacks
    const upper = storeKey.toUpperCase();
    const domainKeys = [
      `SHOPIFY_${upper}_STORE_DOMAIN`,     // New standard pattern
      `SHOPIFY_STORE_DOMAIN_${upper}`,     // Legacy pattern
      'SHOPIFY_STORE_DOMAIN'               // Fallback pattern
    ];
    const tokenKeys = [
      `SHOPIFY_${upper}_ACCESS_TOKEN`,     // New standard pattern
      `SHOPIFY_ADMIN_ACCESS_TOKEN_${upper}`, // Legacy pattern
      'SHOPIFY_ADMIN_ACCESS_TOKEN'         // Fallback pattern
    ];
    
    // Try to get settings with multiple key patterns
    const { data: allSettings } = await supabase
      .from('system_settings')
      .select('key_name, key_value')
      .in('key_name', [...domainKeys, ...tokenKeys]);

    if (!allSettings || allSettings.length === 0) {
      throw new Error(`No Shopify configuration found for store '${storeKey}'. Please configure Shopify settings in Admin.`);
    }

    // Find domain and token values from any matching pattern
    const getSettingValue = (keys: string[]) => {
      for (const key of keys) {
        const setting = allSettings.find(s => s.key_name === key);
        if (setting?.key_value) return setting.key_value;
      }
      return null;
    };

    const shopifyDomain = getSettingValue(domainKeys);
    const shopifyToken = getSettingValue(tokenKeys);

    if (!shopifyDomain) {
      throw new Error(`Shopify domain not configured for store '${storeKey}'. Please set one of: ${domainKeys.join(', ')}`);
    }
    if (!shopifyToken) {
      throw new Error(`Shopify access token not configured for store '${storeKey}'. Please set one of: ${tokenKeys.join(', ')}`);
    }

    const shopifyUrl = `https://${shopifyDomain}/admin/api/2024-07/`;
    const headers = {
      'X-Shopify-Access-Token': shopifyToken,
      'Content-Type': 'application/json',
    };

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        console.log(`Processing item: ${item.subject || item.brand_title}`);
        
        // Build full inventory title with grade information
        const gradeText = item.grade && item.grade !== 'Raw' && item.grade !== 'Ungraded' 
          ? (item.psa_cert ? `PSA ${item.grade}` : `Grade ${item.grade}`) 
          : null;
          
        const titleParts = [
          item.year,
          item.brand_title,
          item.card_number,
          item.subject,
          item.variant,
          gradeText
        ].filter(Boolean);
        const fullTitle = titleParts.join(' ');
        
        // Determine game from brand_title
        const getGame = (brandTitle) => {
          if (!brandTitle) return null;
          const title = brandTitle.toLowerCase();
          if (title.includes('pokemon')) return 'pokemon';
          if (title.includes('magic') || title.includes('mtg')) return 'magic-the-gathering';
          if (title.includes('yugioh') || title.includes('yu-gi-oh')) return 'yugioh';
          return null;
        };
        
        // Determine grading company and status
        const getGradingInfo = (grade, psa_cert) => {
          const isGraded = grade && grade !== 'Raw' && grade !== 'Ungraded';
          
          if (isGraded && psa_cert) {
            // PSA graded card
            return { company: 'PSA', status: 'graded', isGraded: true };
          } else if (isGraded) {
            // Other graded card (BGS, SGC, etc.)
            return { company: 'graded', status: 'graded', isGraded: true };
          } else {
            // Raw single card
            return { company: 'single', status: 'raw', isGraded: false };
          }
        };
        
        const game = getGame(item.brand_title);
        const gradingInfo = getGradingInfo(item.grade, item.psa_cert);
        
        // Determine product weight based on grading status
        const productWeight = gradingInfo.isGraded ? 3 : 1; // 3oz for graded, 1oz for raw
        
        // Build comprehensive tags
        const tags = [
          item.category,
          item.variant,
          item.grade,
          `lot-${item.lot_number}`,
          'intake',
          game,
          gradingInfo.company,
          gradingInfo.status
        ].filter(Boolean);
        
        // Build SKU based on grading status - updated logic for cert numbers
        let productSku;
        if (gradingInfo.isGraded && item.psa_cert) {
          // For graded cards with PSA cert: Use cert number directly as SKU
          productSku = item.psa_cert;
        } else if (gradingInfo.isGraded) {
          // For other graded cards: company + grade + item id
          productSku = `${gradingInfo.company}${item.grade || 'UNKNOWN'}-${item.id.slice(-8)}`;
        } else {
          // For raw cards: use existing SKU or fallback
          productSku = item.sku || `intake-${item.id}`;
        }
        
        // Create product payload
        const productData = {
          product: {
            title: fullTitle || item.subject || item.brand_title || 'Untitled Item',
            body_html: fullTitle || item.subject || item.brand_title || '',
            vendor: item.brand_title || 'Unknown',
            product_type: item.category || 'Trading Card',
            tags: tags.join(','),
            variants: [{
              title: 'Default Title',
              price: (item.price || 99999).toString(),
              sku: productSku,
              barcode: item.psa_cert || productSku,  // Use cert number as barcode for graded cards
              inventory_quantity: item.quantity || 1,
              inventory_management: 'shopify',
              inventory_policy: 'deny',
              weight: productWeight,
              weight_unit: 'oz'
            }],
            status: 'active'
          }
        };

        // Create product in Shopify
        const productResponse = await fetch(`${shopifyUrl}products.json`, {
          method: 'POST',
          headers,
          body: JSON.stringify(productData),
        });

        if (!productResponse.ok) {
          const errorText = await productResponse.text();
          throw new Error(`Shopify API error: ${productResponse.status} - ${errorText}`);
        }

        const productResult = await productResponse.json();
        const productId = productResult.product.id;
        const variantId = productResult.product.variants[0].id;
        const inventoryItemId = productResult.product.variants[0].inventory_item_id;

        console.log(`Created product ${productId} with variant ${variantId}`);

        // Normalize and add images from various sources
        const normalizeImageUrls = (item) => {
          const imageUrls = new Set(); // Use Set to avoid duplicates
          
          // Helper to add valid URLs
          const addUrl = (url) => {
            if (url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
              imageUrls.add(url.trim());
            }
          };
          
          // Helper to parse array-like strings
          const parseArrayString = (str) => {
            if (!str) return [];
            try {
              // Try JSON parse first
              const parsed = JSON.parse(str);
              return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              // Fall back to comma/semicolon split
              return str.split(/[,;]/).map(s => s.trim()).filter(Boolean);
            }
          };
          
          // 1. Handle image_urls field (array, JSON string, or CSV)
          if (item.image_urls) {
            if (Array.isArray(item.image_urls)) {
              item.image_urls.forEach(addUrl);
            } else if (typeof item.image_urls === 'string') {
              parseArrayString(item.image_urls).forEach(addUrl);
            }
          }
          
          // 2. Handle single image_url field
          if (item.image_url) {
            addUrl(item.image_url);
          }
          
          // 3. Extract from psa_snapshot
          if (item.psa_snapshot) {
            try {
              const psaData = typeof item.psa_snapshot === 'string' 
                ? JSON.parse(item.psa_snapshot) 
                : item.psa_snapshot;
              
              if (psaData.imageUrl) addUrl(psaData.imageUrl);
              if (psaData.imageUrls && Array.isArray(psaData.imageUrls)) {
                psaData.imageUrls.forEach(addUrl);
              }
            } catch (error) {
              console.warn(`Failed to parse psa_snapshot for item ${item.id}:`, error);
            }
          }
          
          // 4. Extract from catalog_snapshot  
          if (item.catalog_snapshot) {
            try {
              const catalogData = typeof item.catalog_snapshot === 'string'
                ? JSON.parse(item.catalog_snapshot)
                : item.catalog_snapshot;
              
              if (catalogData.imageUrl) addUrl(catalogData.imageUrl);
              if (catalogData.imageUrls && Array.isArray(catalogData.imageUrls)) {
                catalogData.imageUrls.forEach(addUrl);
              }
              if (catalogData.image_url) addUrl(catalogData.image_url);
            } catch (error) {
              console.warn(`Failed to parse catalog_snapshot for item ${item.id}:`, error);
            }
          }
          
          // Return first 5 unique URLs as array
          return Array.from(imageUrls).slice(0, 5);
        };

        const imageUrls = normalizeImageUrls(item);
        console.log(`Found ${imageUrls.length} image URLs for item ${item.id}:`, imageUrls);

        // Add images to Shopify product
        if (imageUrls.length > 0) {
          let imageSuccessCount = 0;
          let imageFailCount = 0;
          
          for (const imageUrl of imageUrls) {
            try {
              const imageResponse = await fetch(`${shopifyUrl}products/${productId}/images.json`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  image: {
                    src: imageUrl,
                    alt: fullTitle || item.subject || 'Product Image'
                  }
                }),
              });
              
              if (imageResponse.ok) {
                console.log(`Added image to product ${productId}: ${imageUrl}`);
                imageSuccessCount++;
              } else {
                const errorText = await imageResponse.text();
                console.warn(`Failed to add image to product ${productId}: ${imageUrl} - ${errorText}`);
                imageFailCount++;
              }
            } catch (imageError) {
              console.warn(`Error adding image ${imageUrl} to product ${productId}:`, imageError);
              imageFailCount++;
            }
          }
          
          console.log(`Image upload completed for product ${productId}: ${imageSuccessCount} success, ${imageFailCount} failed`);
        } else {
          console.log(`No valid image URLs found for item ${item.id}`);
        }

        // Set sales channels (point of sale and online)
        try {
          const publicationsResponse = await fetch(`${shopifyUrl}products/${productId}/publications.json`);
          if (publicationsResponse.ok) {
            const publications = await publicationsResponse.json();
            
            // Enable for point of sale and online store
            const channelsToEnable = ['point-of-sale', 'online-store'];
            
            for (const publication of publications.publications || []) {
              if (channelsToEnable.includes(publication.name)) {
                await fetch(`${shopifyUrl}products/${productId}/publications/${publication.id}.json`, {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({
                    publication: {
                      product_id: productId,
                      publication_id: publication.id,
                      published: true
                    }
                  }),
                });
                console.log(`Enabled sales channel ${publication.name} for product ${productId}`);
              }
            }
          }
        } catch (channelError) {
          console.warn(`Error setting sales channels for item ${item.id}:`, channelError);
        }

        // Update inventory item cost if cost is provided
        if (item.cost && inventoryItemId) {
          try {
            const costUpdateResponse = await fetch(`${shopifyUrl}inventory_items/${inventoryItemId}.json`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                inventory_item: {
                  id: inventoryItemId,
                  cost: item.cost.toString()
                }
              }),
            });

            if (costUpdateResponse.ok) {
              console.log(`Updated cost for inventory item ${inventoryItemId}: $${item.cost}`);
            } else {
              const costErrorText = await costUpdateResponse.text();
              console.warn(`Failed to update cost for inventory item ${inventoryItemId}: ${costErrorText}`);
            }
          } catch (costError) {
            console.warn(`Error updating cost for item ${item.id}:`, costError);
            // Don't fail the import if cost update fails
          }
        }

        // Update intake item with Shopify IDs and SKU
        await supabase
          .from('intake_items')
          .update({
            pushed_at: new Date().toISOString(),
            shopify_product_id: productId.toString(),
            shopify_variant_id: variantId.toString(),
            shopify_inventory_item_id: inventoryItemId.toString(),
            sku: productSku
          })
          .eq('id', item.id);

        results.push({
          item_id: item.id,
          success: true,
          shopify_product_id: productId,
          shopify_variant_id: variantId
        });

        successCount++;
      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error);
        
        results.push({
          item_id: item.id,
          success: false,
          error: error.message
        });

        errorCount++;
      }
    }

    console.log(`Import completed: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          total: items.length,
          successful: successCount,
          failed: errorCount
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Shopify import error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
