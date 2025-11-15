// Comprehensive type definitions for inventory items and Shopify sync
import type { IntakeItem } from './intake';

/**
 * Inventory Item - Extended from IntakeItem with Shopify sync fields
 */
export interface InventoryItem extends IntakeItem {
  // Shopify sync metadata
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
  shopify_inventory_item_id?: string | null;
  shopify_sync_status?: 'pending' | 'success' | 'failed' | 'error' | 'synced' | null;
  shopify_sync_snapshot?: ShopifySyncSnapshot | null;
  shopify_sync_error?: string | null;
  last_sync_at?: string | null;
  last_shopify_store_key?: string | null;
  last_shopify_location_gid?: string | null;
  last_shopify_synced_at?: string | null;
  last_shopify_correlation_id?: string | null;
  
  // eBay price check data
  ebay_price_check?: {
    checked_at: string;
    ebay_average: number;
    difference_percent: number;
    price_count: number;
  } | null;
  
  // Removal metadata
  removed_at?: string | null;
  removal_reason?: string | null;
  deleted_at?: string | null;
  
  // Timestamps
  updated_at?: string;
  
  // User metadata
  created_by?: string;
  
  // Additional metadata
  barcode?: string;
  notes?: string;
  condition?: string;
  psa_snapshot?: Record<string, any> | null;
}

/**
 * Shopify Sync Snapshot - Detailed sync operation data
 */
export interface ShopifySyncSnapshot {
  decision?: string;
  productId?: string;
  variantId?: string;
  inventoryItemId?: string;
  enforcedBarcode?: string;
  productAdminUrl?: string;
  variantAdminUrl?: string;
  steps?: ShopifySyncStep[];
  error?: string;
  timestamp?: string;
  storeKey?: string;
  locationGid?: string;
  
  // Additional fields found in actual usage
  graded?: boolean | {
    enforcedBarcode?: string;
    decision?: string;
    relinked?: boolean;
    collisions?: {
      sku?: string;
      candidates?: Array<Record<string, any>>;
      [key: string]: any;
    };
    [key: string]: any;
  };
  store?: string | {
    slug?: string;
    domain?: string;
    [key: string]: any;
  };
  input?: Record<string, any>;
  result?: {
    productId?: string;
    variantId?: string;
    inventoryItemId?: string;
    [key: string]: any;
  };
  [key: string]: any; // Allow additional dynamic fields
}

/**
 * Shopify Sync Step - Individual operation within sync process
 */
export interface ShopifySyncStep {
  name: string;
  ok: boolean;
  status?: string;
  message?: string;
  data?: Record<string, any>;
  timestamp?: string;
}

/**
 * Shopify Product Location - Location data from Shopify
 */
export interface ShopifyLocation {
  id: string;
  gid: string;
  name: string;
  address1?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  active: boolean;
}

/**
 * Inventory Filter Options
 */
export interface InventoryFilters {
  search?: string;
  type?: 'all' | 'graded' | 'raw' | 'comic' | 'other';
  status?: 'active' | 'sold' | 'errors' | 'deleted' | 'all';
  storeKey?: string;
  locationGid?: string;
  dateFrom?: string;
  dateTo?: string;
  priceMin?: number;
  priceMax?: number;
}

/**
 * Inventory Sorting Options
 */
export type InventorySortField = 'created_at' | 'updated_at' | 'price' | 'sku' | 'subject';
export type InventorySortDirection = 'asc' | 'desc';

export interface InventorySort {
  field: InventorySortField;
  direction: InventorySortDirection;
}

/**
 * Bulk Operation Types
 */
export interface BulkOperationResult {
  success: number;
  failed: number;
  total: number;
  errors?: Array<{
    itemId: string;
    error: string;
  }>;
}

/**
 * Print Operation Types
 */
export interface PrintJobData {
  itemId: string;
  sku: string;
  title: string;
  price: number;
  barcode?: string;
}

/**
 * Shopify Sync Conflict
 */
export interface ShopifySyncConflict {
  id: string;
  itemId: string;
  conflictType: 'duplicate_barcode' | 'missing_product' | 'price_mismatch' | 'inventory_mismatch';
  description: string;
  suggestedAction: string;
  affectedItems?: InventoryItem[];
  createdAt: string;
}
