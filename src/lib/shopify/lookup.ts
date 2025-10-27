/**
 * Shopify existence checks for idempotent operations
 */

import { supabase } from "@/integrations/supabase/client";
import { META_KEY_EXTERNAL_ID, META_KEY_INTAKE_ID, META_NS } from "./ids";
import { shopifyGraphQL } from "./client";
import { logger } from "@/lib/logger";

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

export async function findProductByHandle(storeKey: string, handle: string): Promise<ShopifyProduct | null> {
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
    const response = await shopifyGraphQL(storeKey, query, { handle });
    return response?.data?.productByHandle ?? null;
  } catch (error) {
    logger.error("Error finding product by handle", error instanceof Error ? error : new Error(String(error)), { handle, storeKey }, 'shopify-lookup');
    return null;
  }
}

export async function findVariantBySku(storeKey: string, sku: string): Promise<ShopifyVariant | null> {
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
    const response = await shopifyGraphQL(storeKey, query, { q: `sku:${JSON.stringify(sku)}` });
    return response?.data?.productVariants?.nodes?.[0] ?? null;
  } catch (error) {
    logger.error("Error finding variant by SKU", error instanceof Error ? error : new Error(String(error)), { sku, storeKey }, 'shopify-lookup');
    return null;
  }
}

export async function findProductByExternalId(storeKey: string, externalId: string): Promise<ShopifyProduct | null> {
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
    const response = await shopifyGraphQL(storeKey, query, { q: filter });
    return response?.data?.products?.nodes?.[0] ?? null;
  } catch (error) {
    logger.error("Error finding product by external ID", error instanceof Error ? error : new Error(String(error)), { externalId, storeKey }, 'shopify-lookup');
    return null;
  }
}

export async function findProductByIntakeId(storeKey: string, intakeId: string): Promise<ShopifyProduct | null> {
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
    const response = await shopifyGraphQL(storeKey, query, { q: filter });
    return response?.data?.products?.nodes?.[0] ?? null;
  } catch (error) {
    logger.error("Error finding product by intake ID", error instanceof Error ? error : new Error(String(error)), { intakeId, storeKey }, 'shopify-lookup');
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
    logger.error("Error checking push status", error instanceof Error ? error : new Error(String(error)), { intakeItemId }, 'shopify-lookup');
    return { isPushed: false };
  }
}