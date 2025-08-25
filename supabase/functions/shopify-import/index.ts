import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildTitleFromParts(
  year?: string | null,
  brandTitle?: string | null,
  cardNumber?: string | null,
  subject?: string | null,
  variant?: string | null
) {
  return [
    year,
    (brandTitle || "").replace(/&amp;/g, "&"),
    cardNumber ? `#${String(cardNumber).replace(/^#/, "")}` : undefined,
    (subject || "").replace(/&amp;/g, "&"),
    (variant || "").replace(/&amp;/g, "&"),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get Shopify settings from system_settings table
    const { data: domainSetting } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'SHOPIFY_STORE_DOMAIN',
        fallbackSecretName: 'SHOPIFY_STORE_DOMAIN'
      }
    });

    const { data: tokenSetting } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'SHOPIFY_ADMIN_ACCESS_TOKEN',
        fallbackSecretName: 'SHOPIFY_ADMIN_ACCESS_TOKEN'
      }
    });

    const SHOPIFY_STORE_DOMAIN = domainSetting?.value;
    const SHOPIFY_ADMIN_ACCESS_TOKEN = tokenSetting?.value;

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      throw new Error("Shopify environment not configured");
    }

    const { itemId } = await req.json();
    if (!itemId) throw new Error("Missing itemId");

    // Load the intake item
    const { data: item, error: itemErr } = await supabase
      .from("intake_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle();

    if (itemErr) throw itemErr;
    if (!item) throw new Error("Item not found");

    // Check if this is a raw single by parsing SKU
    const isRawSingle = item.sku && /^\d+/.test(item.sku) && !item.grade;
    
    let title: string;
    let body: string;
    let imageUrl: string | null = null;
    let handle: string;
    let tags: string[] = [];
    let weight = 1; // Default 1 oz
    let condition = "NM"; // Default condition
    let productId: string | null = null;
    
    if (isRawSingle && item.sku) {
      // Parse SKU for raw singles: productId + printing + condition
      const skuParts = item.sku.split(/[-_\s]+/);
      productId = skuParts[0];
      const printing = skuParts[1] || "";
      condition = skuParts[2] || "NM";
      
      // Fetch product details from database
      const { data: product } = await supabase
        .from("products")
        .select(`
          name,
          tcgplayer_data,
          group_id,
          groups (
            name,
            category_id,
            categories (name)
          )
        `)
        .eq("id", productId)
        .maybeSingle();
        
      if (product) {
        const gameName = product.groups?.categories?.name || "TCG";
        const setName = product.groups?.name || "";
        
        title = [product.name, gameName, setName].filter(Boolean).join(" - ");
        body = product.tcgplayer_data?.description || title;
        imageUrl = product.tcgplayer_data?.imageUrl || null;
        handle = `product-${productId}`;
        tags = [setName, gameName, item.category, "single", "raw", item.lot_number].filter(Boolean);
        
        // Extract image URL from tcgplayer_data if available
        if (product.tcgplayer_data?.imageUrl) {
          imageUrl = product.tcgplayer_data.imageUrl;
        }
      } else {
        // Fallback if product not found
        title = item.sku;
        body = title;
        handle = `product-${productId}`;
        tags = [item.category, "single", "raw", item.lot_number].filter(Boolean);
      }
    } else {
      // Original logic for graded cards
      title = buildTitleFromParts(item.year, item.brand_title, item.card_number, item.subject, item.variant) || item.sku || item.lot_number;
      body = title;
      handle = item.sku || item.psa_cert || item.lot_number || "";
      tags = [item.category, item.grade, item.year, "graded", item.lot_number].filter(Boolean);
    }
    
    const price = item.price != null ? Number(item.price) : 0;
    const sku = item.sku || item.psa_cert || item.lot_number;
    const quantity = item.quantity ?? 1;

    // Helper: Shopify REST Admin API request
    const api = async (path: string, init?: RequestInit) => {
      const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07${path}`;
      const res = await fetch(url, {
        ...init,
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify ${path} ${res.status}: ${text}`);
      }
      return res.json();
    };

    // Helper: Shopify GraphQL Admin API request
    const gql = async (query: string, variables?: Record<string, unknown>) => {
      const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/graphql.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });
      const json = await res.json();
      if (!res.ok || json.errors) {
        throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors || json)}`);
      }
      return json.data;
    };

    const gidToId = (gid: string | null | undefined) => gid ? gid.split("/").pop() || "" : "";

    let shopifyProductId = item.shopify_product_id as string | null;
    let shopifyVariantId = item.shopify_variant_id as string | null;
    let shopifyInventoryItemId = item.shopify_inventory_item_id as string | null;

    if (isRawSingle) {
    // For raw singles, handle product/variant differently based on condition
      // First, look for existing product by handle
      try {
        const productData = await gql(
          `query($handle: String!) {
            product(handle: $handle) {
              id
              tags
              variants(first: 10) {
                edges {
                  node {
                    id
                    inventoryItem { id }
                    sku
                    option1
                    barcode
                  }
                }
              }
            }
          }`,
          { handle }
        );
        
        if (productData?.product) {
          shopifyProductId = gidToId(productData.product.id);
          
          // Look for existing variant with this condition
          const existingVariant = productData.product.variants.edges.find(
            (edge: any) => edge.node.option1 === condition
          );
          
          if (existingVariant) {
            shopifyVariantId = gidToId(existingVariant.node.id);
            shopifyInventoryItemId = gidToId(existingVariant.node.inventoryItem?.id);
          }
          
          // Merge tags with existing product tags
          const existingTags = productData.product.tags || [];
          const newTags = [...new Set([...existingTags, ...tags])];
          
          // Update product tags
          await api(`/products/${shopifyProductId}.json`, {
            method: "PUT",
            body: JSON.stringify({
              product: {
                id: Number(shopifyProductId),
                tags: newTags.join(", "),
              },
            }),
          });
        }
      } catch (e) {
        console.warn("Product lookup by handle failed:", e);
      }
      
      if (shopifyProductId && !shopifyVariantId) {
        // Product exists but variant for this condition doesn't - create variant
        const newVariant = await api(`/products/${shopifyProductId}/variants.json`, {
          method: "POST",
          body: JSON.stringify({
            variant: {
              option1: condition,
              price: String(price),
              sku,
              barcode: sku || item.lot_number,
              inventory_management: "shopify",
              requires_shipping: true,
              weight: weight,
              weight_unit: "oz",
            },
          }),
        });
        
        shopifyVariantId = String(newVariant.variant.id);
        shopifyInventoryItemId = String(newVariant.variant.inventory_item_id);
      } else if (shopifyVariantId) {
        // Update existing variant
        await api(`/variants/${shopifyVariantId}.json`, {
          method: "PUT",
          body: JSON.stringify({
            variant: {
              id: Number(shopifyVariantId),
              price: String(price),
              sku,
              barcode: sku || item.lot_number,
              weight: weight,
              weight_unit: "oz",
            },
          }),
        });
      } else {
        // Create new product with first variant
        const productPayload: any = {
          title,
          body_html: body,
          handle,
          status: "active",
          tags: tags.join(", "),
          product_type: "Trading Card",
          options: [{ name: "Condition" }],
          variants: [
            {
              option1: condition,
              price: String(price),
              sku,
              barcode: sku || item.lot_number,
              inventory_management: "shopify",
              requires_shipping: true,
              weight: weight,
              weight_unit: "oz",
            },
          ],
        };
        
        // Add image if available
        if (imageUrl) {
          productPayload.images = [{ src: imageUrl }];
        }
        
        const created = await api(`/products.json`, {
          method: "POST",
          body: JSON.stringify({ product: productPayload }),
        });

        const prod = created.product;
        const variant = prod.variants?.[0];
        shopifyProductId = String(prod.id);
        shopifyVariantId = String(variant.id);
        shopifyInventoryItemId = String(variant.inventory_item_id);
      }
    } else {
      // Original logic for graded cards - lookup by PSA cert (barcode) first, then SKU
      if (!(shopifyVariantId && shopifyProductId && shopifyInventoryItemId)) {
        try {
          // Try PSA cert as barcode first
          if (item.psa_cert) {
            const data = await gql(
              `query($q: String!) {
                productVariants(first: 1, query: $q) {
                  edges { node { id product { id tags } inventoryItem { id } } }
                }
              }`,
              { q: `barcode:"${String(item.psa_cert).replace(/"/g, '\\"')}"` }
            );
            const edge = data?.productVariants?.edges?.[0];
            if (edge?.node) {
              shopifyProductId = gidToId(edge.node.product?.id);
              shopifyVariantId = gidToId(edge.node.id);
              shopifyInventoryItemId = gidToId(edge.node.inventoryItem?.id);
              
              // Merge tags for existing graded product
              const existingTags = edge.node.product?.tags || [];
              const newTags = [...new Set([...existingTags, ...tags])];
              
              await api(`/products/${shopifyProductId}.json`, {
                method: "PUT",
                body: JSON.stringify({
                  product: {
                    id: Number(shopifyProductId),
                    tags: newTags.join(", "),
                  },
                }),
              });
            }
          }
          
          // Fallback to SKU lookup if PSA cert didn't work
          if (!shopifyVariantId) {
            const data = await gql(
              `query($q: String!) {
                productVariants(first: 1, query: $q) {
                  edges { node { id product { id tags } inventoryItem { id } } }
                }
              }`,
              { q: `sku:"${String(sku).replace(/"/g, '\\"')}"` }
            );
            const edge = data?.productVariants?.edges?.[0];
            if (edge?.node) {
              shopifyProductId = gidToId(edge.node.product?.id);
              shopifyVariantId = gidToId(edge.node.id);
              shopifyInventoryItemId = gidToId(edge.node.inventoryItem?.id);
              
              // Merge tags for existing graded product
              const existingTags = edge.node.product?.tags || [];
              const newTags = [...new Set([...existingTags, ...tags])];
              
              await api(`/products/${shopifyProductId}.json`, {
                method: "PUT",
                body: JSON.stringify({
                  product: {
                    id: Number(shopifyProductId),
                    tags: newTags.join(", "),
                  },
                }),
              });
            }
          }
        } catch (e) {
          console.warn("Graded card lookup via GraphQL failed; will create product", e);
        }
      }

      if (shopifyVariantId && shopifyProductId && shopifyInventoryItemId) {
        // Update existing variant
        await api(`/variants/${shopifyVariantId}.json`, {
          method: "PUT",
          body: JSON.stringify({ 
            variant: { 
              id: Number(shopifyVariantId), 
              price: String(price), 
              sku,
              barcode: item.psa_cert || sku || item.lot_number
            } 
          }),
        });
      } else {
        // Create product + variant for graded cards
        const created = await api(`/products.json`, {
          method: "POST",
          body: JSON.stringify({
            product: {
              title,
              body_html: body,
              handle,
              status: "active",
              tags: tags.join(", "),
              product_type: "Graded Card",
              variants: [
                {
                  price: String(price ?? 0),
                  sku,
                  barcode: item.psa_cert || sku || item.lot_number,
                  inventory_management: "shopify",
                  requires_shipping: true,
                  weight: weight,
                  weight_unit: "oz",
                },
              ],
            },
          }),
        });

        const prod = created.product;
        const variant = prod.variants?.[0];
        shopifyProductId = String(prod.id);
        shopifyVariantId = String(variant.id);
        shopifyInventoryItemId = String(variant.inventory_item_id);
      }
    }

    // Persist Shopify IDs
    await supabase
      .from("intake_items")
      .update({
        shopify_product_id: shopifyProductId,
        shopify_variant_id: shopifyVariantId,
        shopify_inventory_item_id: shopifyInventoryItemId,
      })
      .eq("id", itemId);

    // Find the "Aloha Card Shop" location or use first available
    const locs = await api(`/locations.json`);
    let targetLocation = locs.locations?.find((loc: any) => 
      loc.name?.toLowerCase().includes('aloha card shop')
    );
    
    // If Aloha Card Shop not found, use the first location as fallback
    if (!targetLocation) {
      targetLocation = locs.locations?.[0];
    }
    
    const locationId = String(targetLocation?.id);
    if (!locationId) throw new Error("No Shopify locations found");

    // Set inventory to our quantity
    await api(`/inventory_levels/set.json`, {
      method: "POST",
      body: JSON.stringify({
        location_id: Number(locationId),
        inventory_item_id: Number(shopifyInventoryItemId!),
        available: Number(quantity ?? 1),
      }),
    });

    // Mark as pushed
    const { error: upErr } = await supabase
      .from("intake_items")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", itemId);
    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({ ok: true, productId: shopifyProductId, variantId: shopifyVariantId, inventoryItemId: shopifyInventoryItemId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("shopify-import error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
