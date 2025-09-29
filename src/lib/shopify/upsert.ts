/**
 * Idempotent Shopify product upsert with safe retries
 */

import { withBackoff } from "../utils/backoff";
import { buildHandle, buildSku, buildMetafields, CardIdentifiers } from "./ids";
import { 
  findProductByHandle, 
  findVariantBySku, 
  findProductByExternalId,
  findProductByIntakeId,
  ShopifyProduct, 
  ShopifyVariant 
} from "./lookup";
import { supabase } from "@/integrations/supabase/client";

// Mock shopifyGraphQL function - replace with actual implementation  
async function shopifyGraphQL(query: string, variables: Record<string, any>) {
  console.log("GraphQL Mutation:", query, variables);
  return { 
    data: { 
      productSet: { 
        product: { 
          id: "gid://shopify/Product/12345", 
          handle: "test-product", 
          title: "Test Product",
          variants: {
            nodes: [{ id: "gid://shopify/ProductVariant/67890", sku: "TEST-001" }]
          }
        },
        userErrors: []
      } 
    } 
  };
}

export interface UpsertCard extends CardIdentifiers {
  externalId: string;
  intakeId?: string;
  title: string;
  descriptionHtml?: string;
  price?: number;
  inventory?: number;
  imageUrl?: string;
  weight?: number;
  locationGid?: string;
}

export interface UpsertResult {
  success: boolean;
  product?: {
    id: string;
    handle: string;
    title: string;
    variantId?: string;
  };
  error?: string;
  wasUpdate?: boolean;
}

export async function pushProductUpsert(card: UpsertCard): Promise<UpsertResult> {
  const handle = buildHandle(card);
  const sku = buildSku(card);
  
  console.log(`Upserting product: handle=${handle}, sku=${sku}, externalId=${card.externalId}`);
  
  try {
    // Comprehensive existence checks (makes retries idempotent)
    let existing = null;
    let wasUpdate = false;
    
    // Check by intake ID first (most specific)
    if (card.intakeId) {
      existing = await findProductByIntakeId(card.intakeId);
      if (existing) {
        console.log(`Found existing product by intake ID: ${existing.id}`);
        wasUpdate = true;
      }
    }
    
    // Check by external ID
    if (!existing) {
      existing = await findProductByExternalId(card.externalId);
      if (existing) {
        console.log(`Found existing product by external ID: ${existing.id}`);
        wasUpdate = true;
      }
    }
    
    // Check by handle
    if (!existing) {
      existing = await findProductByHandle(handle);
      if (existing) {
        console.log(`Found existing product by handle: ${existing.id}`);
        wasUpdate = true;
      }
    }
    
    // Check by SKU (variant level)
    if (!existing) {
      const variantResult = await findVariantBySku(sku);
      if (variantResult?.product) {
        existing = {
          id: variantResult.product.id,
          handle: variantResult.product.handle,
          title: '',
          variants: { nodes: [{ id: variantResult.id, sku: variantResult.sku }] }
        } as ShopifyProduct;
        console.log(`Found existing product by variant SKU: ${existing.id}`);
        wasUpdate = true;
      }
    }
    
    // Prepare upsert variables
    const variables = {
      input: {
        product: {
          handle, // Stable identifier
          title: card.title,
          descriptionHtml: card.descriptionHtml ?? "",
          metafields: buildMetafields(card.externalId, card.intakeId),
          images: card.imageUrl ? [{ src: card.imageUrl }] : undefined,
          variants: [{
            sku,
            price: card.price?.toFixed(2),
            weight: card.weight,
            inventoryQuantities: (card.inventory != null && card.locationGid) ? [{
              availableQuantity: card.inventory,
              locationId: card.locationGid,
            }] : undefined,
          }],
        },
      },
    };
    
    const mutation = `
      mutation productSet($input: ProductSetInput!) {
        productSet(input: $input) {
          product { 
            id 
            handle 
            title
            variants(first: 1) {
              nodes {
                id
                sku
              }
            }
          }
          userErrors { 
            field 
            message 
          }
        }
      }
    `;
    
    // Execute with backoff retry
    const result = await withBackoff(async () => {
      console.log(`${wasUpdate ? 'Updating' : 'Creating'} product with productSet`);
      const response = await shopifyGraphQL(mutation, variables);
      
      const userErrors = response?.data?.productSet?.userErrors;
      if (userErrors?.length) {
        const errorMsg = `Shopify userErrors: ${JSON.stringify(userErrors)}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      return response?.data?.productSet?.product;
    }, `shopify-upsert-${card.externalId}`, {
      maxRetries: 3,
      baseDelay: 1000,
      retryCondition: (error: any) => {
        // Retry on network errors, rate limits, and server errors
        if (error?.status === 429) return true; // Rate limit
        if (error?.status >= 500) return true; // Server errors
        if (error?.code === 'NETWORK_ERROR') return true;
        if (error?.message?.includes('timeout')) return true;
        
        // Don't retry on user errors (bad data)
        if (error?.message?.includes('userErrors')) return false;
        
        return true;
      }
    });
    
    if (!result) {
      throw new Error('No product returned from Shopify');
    }
    
    const variantId = result.variants?.nodes?.[0]?.id;
    
    return {
      success: true,
      product: {
        id: result.id,
        handle: result.handle,
        title: result.title,
        variantId
      },
      wasUpdate
    };
    
  } catch (error) {
    console.error('Product upsert failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function markItemAsPushed(
  intakeItemId: string, 
  shopifyProductId: string, 
  shopifyVariantId?: string
): Promise<void> {
  try {
    const updates: any = {
      shopify_product_id: shopifyProductId,
      pushed_at: new Date().toISOString(),
      last_shopify_synced_at: new Date().toISOString(),
      shopify_sync_status: 'completed',
      last_shopify_sync_error: null
    };
    
    if (shopifyVariantId) {
      updates.shopify_variant_id = shopifyVariantId;
    }
    
    const { error } = await supabase
      .from('intake_items')
      .update(updates)
      .eq('id', intakeItemId);
      
    if (error) {
      console.error('Failed to mark item as pushed:', error);
      throw error;
    }
    
    console.log(`Marked item ${intakeItemId} as successfully pushed to Shopify`);
  } catch (error) {
    console.error('Error marking item as pushed:', error);
    throw error;
  }
}

export async function markItemPushFailed(
  intakeItemId: string, 
  errorMessage: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('intake_items')
      .update({
        last_shopify_sync_error: errorMessage,
        last_shopify_synced_at: new Date().toISOString(),
        shopify_sync_status: 'failed'
      })
      .eq('id', intakeItemId);
      
    if (error) {
      console.error('Failed to mark item push as failed:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error marking item push as failed:', error);
  }
}