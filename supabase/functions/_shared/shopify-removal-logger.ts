/**
 * Centralized logging for Shopify removal operations
 * Provides uniform, auditable logs without leaking sensitive data
 */

export type RemovalOutcome = 
  | 'deleted'
  | 'already_deleted_404'
  | `failed_${number}`;

export interface RemovalLogContext {
  item_id: string;
  sku: string | null;
  shopify_product_id: string | null;
  store_key: string | null;
  outcome: RemovalOutcome;
  error_message?: string;
}

/**
 * Log a Shopify removal attempt with sanitized context
 */
export function logRemovalOutcome(context: RemovalLogContext): void {
  const {
    item_id,
    sku,
    shopify_product_id,
    store_key,
    outcome,
    error_message
  } = context;

  // Build safe log message without sensitive data
  const safeLog = {
    item_id: item_id.substring(0, 8),
    sku: sku?.substring(0, 16) || 'N/A',
    shopify_product_id: shopify_product_id?.substring(0, 16) || 'N/A',
    store_key,
    outcome,
    timestamp: new Date().toISOString()
  };

  if (outcome === 'deleted') {
    console.log(`[Shopify Removal Success] ${JSON.stringify(safeLog)}`);
  } else if (outcome === 'already_deleted_404') {
    console.log(`[Shopify Removal - Already Gone] ${JSON.stringify(safeLog)}`);
  } else {
    console.warn(
      `[Shopify Removal Failed] ${JSON.stringify(safeLog)} - ${error_message || 'Unknown error'}`
    );
  }
}
