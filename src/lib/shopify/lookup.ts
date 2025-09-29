/**
 * Shopify existence checks for idempotent operations
 */

import { supabase } from "@/integrations/supabase/client";
import { META_KEY_EXTERNAL_ID, META_KEY_INTAKE_ID, META_NS } from "./ids";

// Mock shopifyGraphQL function - replace with actual implementation
async function shopifyGraphQL(query: string, variables: Record<string, any>) {
  // This would be implemented with actual Shopify GraphQL client
  console.log("GraphQL Query:", query, variables);
  return { data: null };
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  variants: {
    nodes: Array<{
      id: string;
      sku: string;
    }>;
  };
}

export interface ShopifyVariant {
  id: string;
  sku: string;
  product: {
    id: string;
    handle: string;
  };
}

export async function findProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const query = `
    query($handle: String!) {
      productByHandle(handle: $handle) {
        id
        handle
        title
        variants(first: 50) {
          nodes {
            id
            sku
          }
        }
      }
    }
  `;
  
  try {
    const response = await shopifyGraphQL(query, { handle });
    return response?.data?.productByHandle ?? null;
  } catch (error) {
    console.error("Error finding product by handle:", error);
    return null;
  }
}

export async function findVariantBySku(sku: string): Promise<ShopifyVariant | null> {
  const query = `
    query($query: String!) {
      productVariants(first: 50, query: $query) {
        nodes {
          id
          sku
          product {
            id
            handle
          }
        }
      }
    }
  `;
  
  try {
    const response = await shopifyGraphQL(query, { q: `sku:${JSON.stringify(sku)}` });
    return response?.data?.productVariants?.nodes?.[0] ?? null;
  } catch (error) {
    console.error("Error finding variant by SKU:", error);
    return null;
  }
}

export async function findProductByExternalId(externalId: string): Promise<ShopifyProduct | null> {
  const query = `
    query($query: String!) {
      products(first: 10, query: $query) {
        nodes {
          id
          handle
          title
          variants(first: 50) {
            nodes {
              id
              sku
            }
          }
        }
      }
    }
  `;
  
  try {
    const filter = `metafield:${META_NS}.${META_KEY_EXTERNAL_ID}:${externalId}`;
    const response = await shopifyGraphQL(query, { q: filter });
    return response?.data?.products?.nodes?.[0] ?? null;
  } catch (error) {
    console.error("Error finding product by external ID:", error);
    return null;
  }
}

export async function findProductByIntakeId(intakeId: string): Promise<ShopifyProduct | null> {
  const query = `
    query($query: String!) {
      products(first: 10, query: $query) {
        nodes {
          id
          handle
          title
          variants(first: 50) {
            nodes {
              id
              sku
            }
          }
        }
      }
    }
  `;
  
  try {
    const filter = `metafield:${META_NS}.${META_KEY_INTAKE_ID}:${intakeId}`;
    const response = await shopifyGraphQL(query, { q: filter });
    return response?.data?.products?.nodes?.[0] ?? null;
  } catch (error) {
    console.error("Error finding product by intake ID:", error);
    return null;
  }
}

// Helper to check if item was already pushed to Shopify
export async function checkShopifyPushStatus(intakeItemId: string): Promise<{
  isPushed: boolean;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  lastPushAttempt?: string;
  lastError?: string;
}> {
  try {
    const { data: item } = await supabase
      .from('intake_items')
      .select('shopify_product_id, shopify_variant_id, pushed_at, last_shopify_sync_error, last_shopify_synced_at')
      .eq('id', intakeItemId)
      .maybeSingle();
      
    if (!item) {
      return { isPushed: false };
    }
    
    return {
      isPushed: !!(item.shopify_product_id && item.pushed_at),
      shopifyProductId: item.shopify_product_id,
      shopifyVariantId: item.shopify_variant_id,
      lastPushAttempt: item.last_shopify_synced_at,
      lastError: item.last_shopify_sync_error
    };
  } catch (error) {
    console.error("Error checking push status:", error);
    return { isPushed: false };
  }
}