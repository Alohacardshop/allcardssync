 // Centralized Shopify inventory write helper with logging, safety, and audit trail
 // ALL inventory writes MUST go through this module
 
 import { API_VER, fetchRetry, getInventoryLevel } from './shopify-helpers.ts'
 
 /**
  * Inventory write action types - determines API selection and business context
  */
 export type InventoryWriteAction =
   | 'receiving'           // Delta: +quantity received from intake
   | 'transfer_out'        // Delta: -quantity moved from source location
   | 'transfer_in'         // Delta: +quantity moved to destination location
   | 'refund'              // Delta: +quantity restored after refund/cancellation (graded)
   | 'manual_adjust'       // Delta: +/- manual correction
   | 'enforce_graded'      // Set: exact 0 or 1 for graded items
   | 'initial_set'         // Set: first-time inventory set for new products
   | 'cross_channel_zero'  // Set: zero inventory when sold on another channel (eBay->Shopify)
 
 export interface InventoryWriteParams {
   // Shopify credentials
   domain: string
   token: string
   
   // Inventory identification
   inventory_item_id: string
   location_id: string  // Numeric location ID (not GID)
   
   // Operation details
   action: InventoryWriteAction
   
   /** 
    * For delta actions: the change amount (positive or negative)
    * For set actions: the target absolute value
    */
   quantity: number
   
   /**
    * For optimistic locking: expected current level
    * If provided and doesn't match Shopify, write will be rejected
    */
   expected_available?: number
   
   // Context for logging
   request_id: string
   store_key: string
   item_id?: string      // intake_items.id if available
   sku?: string
   source_function: string
   triggered_by?: string // user_id, 'webhook', 'system', etc.
   
   // Supabase client for logging
   supabase?: any
 }
 
 export interface InventoryWriteResult {
   success: boolean
   api_used: 'adjust' | 'set'
   previous_available?: number
   new_available?: number
   error?: string
   stale?: boolean  // True if optimistic locking check failed
   latency_ms: number
 }
 
 /**
  * Actions that use the Adjust API (delta operations)
  * These are safer and respect Shopify as source of truth
  */
 const DELTA_ACTIONS: InventoryWriteAction[] = [
   'receiving',
   'transfer_out',
   'transfer_in',
   'refund',
   'manual_adjust'
 ]
 
 /**
  * Actions that use the Set API (absolute values)
  * Use with caution - only for specific ownership enforcement
  */
 const SET_ACTIONS: InventoryWriteAction[] = [
   'enforce_graded',
   'initial_set',
   'cross_channel_zero'
 ]
 
 /**
  * Convert action type and quantity to a signed delta value
  */
 function getDeltaValue(action: InventoryWriteAction, quantity: number): number {
   switch (action) {
     case 'receiving':
     case 'transfer_in':
     case 'refund':
       // These add inventory
       return Math.abs(quantity)
     
     case 'transfer_out':
       // This removes inventory
       return -Math.abs(quantity)
     
     case 'manual_adjust':
       // Already signed by caller
       return quantity
     
     default:
       throw new Error(`getDeltaValue called with set action: ${action}`)
   }
 }
 
 /**
  * Validate action-specific constraints
  */
 function validateAction(action: InventoryWriteAction, quantity: number): { valid: boolean; error?: string } {
   if (action === 'enforce_graded') {
     if (quantity !== 0 && quantity !== 1) {
       return { 
         valid: false, 
         error: `enforce_graded requires quantity 0 or 1, got ${quantity}` 
       }
     }
   }
   
   if (action === 'cross_channel_zero' && quantity !== 0) {
     return {
       valid: false,
       error: `cross_channel_zero requires quantity 0, got ${quantity}`
     }
   }
   
   return { valid: true }
 }
 
 /**
  * Log the inventory write to the audit table
  */
 async function logWrite(
   supabase: any,
   params: InventoryWriteParams,
   result: InventoryWriteResult,
   apiUsed: 'adjust' | 'set',
   delta?: number,
   setValue?: number
 ): Promise<void> {
   if (!supabase) {
     console.log('[inventory-write] No supabase client, skipping DB log')
     return
   }
   
   try {
     await supabase.from('inventory_write_log').insert({
       request_id: params.request_id,
       store_key: params.store_key,
       item_id: params.item_id || null,
       sku: params.sku || null,
       inventory_item_id: params.inventory_item_id,
       location_gid: `gid://shopify/Location/${params.location_id}`,
       action: params.action,
       api_used: apiUsed,
       delta: delta ?? null,
       set_value: setValue ?? null,
       expected_available: params.expected_available ?? null,
       previous_available: result.previous_available ?? null,
       new_available: result.new_available ?? null,
       success: result.success,
       error_message: result.error ?? null,
       latency_ms: result.latency_ms,
       source_function: params.source_function,
       triggered_by: params.triggered_by || null
     })
   } catch (e) {
     console.error('[inventory-write] Failed to log write:', e)
   }
 }
 
 /**
  * Execute a delta (adjust) inventory operation
  */
 async function executeAdjust(
   domain: string,
   token: string,
   inventoryItemId: string,
   locationId: string,
   delta: number,
   expectedAvailable?: number
 ): Promise<{ success: boolean; previous?: number; new?: number; error?: string; stale?: boolean }> {
   
   // First, fetch current level for logging and optional optimistic lock
   const currentLevel = await getInventoryLevel(domain, token, inventoryItemId, locationId)
   const previousAvailable = currentLevel?.available ?? 0
   
   // Optimistic locking check
   if (typeof expectedAvailable === 'number' && expectedAvailable !== previousAvailable) {
     return {
       success: false,
       previous: previousAvailable,
       error: `STALE_DATA: expected ${expectedAvailable}, found ${previousAvailable}`,
       stale: true
     }
   }
   
   // Prevent negative inventory
   const projectedValue = previousAvailable + delta
   if (projectedValue < 0) {
     return {
       success: false,
       previous: previousAvailable,
       error: `INSUFFICIENT_INVENTORY: have ${previousAvailable}, delta ${delta} would result in ${projectedValue}`
     }
   }
   
   // Execute adjust API call
   try {
     const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/adjust.json`, {
       method: 'POST',
       headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
       body: JSON.stringify({
         location_id: locationId,
         inventory_item_id: inventoryItemId,
         available_adjustment: delta
       })
     })
     
     if (!r.ok) {
       const text = await r.text()
       return { success: false, previous: previousAvailable, error: `Adjust API failed: ${r.status} ${text}` }
     }
     
     const result = await r.json()
     return {
       success: true,
       previous: previousAvailable,
       new: result.inventory_level?.available ?? projectedValue
     }
   } catch (e) {
     return {
       success: false,
       previous: previousAvailable,
       error: e instanceof Error ? e.message : 'Unknown adjust error'
     }
   }
 }
 
 /**
  * Execute an absolute (set) inventory operation
  */
 async function executeSet(
   domain: string,
   token: string,
   inventoryItemId: string,
   locationId: string,
   targetValue: number,
   expectedAvailable?: number
 ): Promise<{ success: boolean; previous?: number; new?: number; error?: string; stale?: boolean }> {
   
   // First, fetch current level for logging and optional optimistic lock
   const currentLevel = await getInventoryLevel(domain, token, inventoryItemId, locationId)
   const previousAvailable = currentLevel?.available ?? 0
   
   // Optimistic locking check (especially important for set operations!)
   if (typeof expectedAvailable === 'number' && expectedAvailable !== previousAvailable) {
     return {
       success: false,
       previous: previousAvailable,
       error: `STALE_DATA: expected ${expectedAvailable}, found ${previousAvailable}`,
       stale: true
     }
   }
   
   // Execute set API call
   try {
     const r = await fetchRetry(`https://${domain}/admin/api/${API_VER}/inventory_levels/set.json`, {
       method: 'POST',
       headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
       body: JSON.stringify({
         location_id: locationId,
         inventory_item_id: inventoryItemId,
         available: targetValue
       })
     })
     
     if (!r.ok) {
       const text = await r.text()
       return { success: false, previous: previousAvailable, error: `Set API failed: ${r.status} ${text}` }
     }
     
     const result = await r.json()
     return {
       success: true,
       previous: previousAvailable,
       new: result.inventory_level?.available ?? targetValue
     }
   } catch (e) {
     return {
       success: false,
       previous: previousAvailable,
       error: e instanceof Error ? e.message : 'Unknown set error'
     }
   }
 }
 
 /**
  * MAIN ENTRY POINT: Write inventory to Shopify with full safety and logging
  * 
  * This is the ONLY function that should be used for Shopify inventory writes.
  * It automatically:
  * - Selects the correct API (adjust vs set) based on action type
  * - Validates action-specific constraints
  * - Performs optimistic locking if expected_available is provided
  * - Logs all operations to inventory_write_log
  * - Returns detailed results including latency
  */
 export async function writeInventory(params: InventoryWriteParams): Promise<InventoryWriteResult> {
   const startTime = performance.now()
   const { action, quantity, domain, token, inventory_item_id, location_id, expected_available, supabase } = params
   
   // Validate action
   const validation = validateAction(action, quantity)
   if (!validation.valid) {
     const result: InventoryWriteResult = {
       success: false,
       api_used: SET_ACTIONS.includes(action) ? 'set' : 'adjust',
       error: validation.error,
       latency_ms: Math.round(performance.now() - startTime)
     }
     await logWrite(supabase, params, result, result.api_used)
     return result
   }
   
   // Determine which API to use
   const useAdjustApi = DELTA_ACTIONS.includes(action)
   const apiUsed = useAdjustApi ? 'adjust' : 'set'
   
   let operationResult: { success: boolean; previous?: number; new?: number; error?: string; stale?: boolean }
   let delta: number | undefined
   let setValue: number | undefined
   
   if (useAdjustApi) {
     delta = getDeltaValue(action, quantity)
     console.log(`[inventory-write] ${params.request_id} | ${action} | adjust API | delta=${delta} | ${inventory_item_id}@${location_id}`)
     operationResult = await executeAdjust(domain, token, inventory_item_id, location_id, delta, expected_available)
   } else {
     setValue = quantity
     console.log(`[inventory-write] ${params.request_id} | ${action} | set API | target=${setValue} | ${inventory_item_id}@${location_id}`)
     operationResult = await executeSet(domain, token, inventory_item_id, location_id, setValue, expected_available)
   }
   
   const latencyMs = Math.round(performance.now() - startTime)
   
   const result: InventoryWriteResult = {
     success: operationResult.success,
     api_used: apiUsed,
     previous_available: operationResult.previous,
     new_available: operationResult.new,
     error: operationResult.error,
     stale: operationResult.stale,
     latency_ms: latencyMs
   }
   
   // Log to database
   await logWrite(supabase, params, result, apiUsed, delta, setValue)
   
   // Console log summary
   if (result.success) {
     console.log(`[inventory-write] ✓ ${params.sku || inventory_item_id} ${operationResult.previous} → ${operationResult.new} (${latencyMs}ms)`)
   } else {
     console.error(`[inventory-write] ✗ ${params.sku || inventory_item_id}: ${result.error} (${latencyMs}ms)`)
   }
   
   return result
 }
 
 /**
  * Helper to generate a unique request ID for tracing
  */
 export function generateRequestId(prefix: string = 'inv'): string {
   return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
 }
 
 /**
  * Helper to extract numeric location ID from GID format
  */
 export function locationGidToId(gid: string): string {
   return gid.replace('gid://shopify/Location/', '')
 }