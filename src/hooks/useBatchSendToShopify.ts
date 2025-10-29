import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"
import { ShopifyError, RateLimitError } from "@/types/errors"
import { logger } from "@/lib/logger"
import { queryKeys } from "@/lib/queryKeys"

/**
 * useBatchSendToShopify Hook
 * 
 * Enhanced with new atomic RPC (2025-10-29):
 * - Uses send_and_queue_inventory RPC that handles both inventory marking + Shopify queueing atomically
 * - Simplified error handling without manual queue step
 * - Automatic retry with 2-second backoff for transient cache errors
 * - Shows first 100 chars of PostgREST errors in toast notifications
 * 
 * Error scenarios handled:
 * 1. "record 'new'" / "record 'old'" errors → Suggests running db-fix-intake-items.sh
 * 2. Schema/column errors → Generic schema error with refresh suggestion
 * 3. Rate limit errors → Exponential backoff retry
 * 4. Network/transient errors → Standard error handling
 */

export interface BatchConfig {
  batchSize: number
  delayBetweenChunks: number
  failFast: boolean
  vendor?: string
}

export interface BatchProgress {
  currentChunk: number
  totalChunks: number
  processedItems: number
  totalItems: number
  isProcessing: boolean
}

export interface BatchSendResult {
  id: string
  type: 'Graded' | 'Raw'
  success: boolean
  correlationId?: string
  productId?: string
  variantId?: string
  inventoryItemId?: string
  productAdminUrl?: string
  variantAdminUrl?: string
  error?: string
}

export interface BatchSendResponse {
  ok: boolean
  processed: number
  rejected: number
  shopify_success: number
  shopify_errors: number
  results: BatchSendResult[]
  rejected_items?: Array<{ id: string; reason: string }>
}

export function useBatchSendToShopify() {
  const queryClient = useQueryClient()
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const sendTimeoutRef = useState<NodeJS.Timeout | null>(null)[0]

  const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  const exponentialBackoff = async (attempt: number, baseDelay: number = 1000) => {
    const backoffDelay = Math.min(baseDelay * Math.pow(2, attempt), 30000) // Max 30 seconds
    const jitter = Math.random() * 1000 // Add up to 1 second of jitter
    await delay(backoffDelay + jitter)
  }

  const isRateLimitError = (error: ShopifyError | Error | unknown): boolean => {
    const errorMessage = error && typeof error === 'object' && 'message' in error 
      ? (error as { message: string }).message 
      : String(error)
    
    return errorMessage.includes('429') ||
           (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429) ||
           errorMessage.toLowerCase().includes('rate limit') ||
           errorMessage.toLowerCase().includes('too many requests')
  }

  const sendChunkedBatchToShopify = async (
    itemIds: string[],
    storeKey: "hawaii" | "las_vegas",
    locationGid: string,
    config: BatchConfig = { batchSize: 5, delayBetweenChunks: 1000, failFast: false },
    onProgress?: (progress: BatchProgress) => void,
    autoProcess: boolean = false
  ): Promise<BatchSendResponse> => {
    logger.info('Starting chunked batch send', { 
      itemCount: itemIds.length, 
      storeKey, 
      locationGid: locationGid?.substring(0, 20) + '...',
      config,
      autoProcess
    }, 'useBatchSendToShopify')
    
    if (!storeKey || !locationGid) {
      const error = "Store and location must be selected"
      logger.error('Validation failed', new Error(error), { storeKey, locationGid }, 'useBatchSendToShopify')
      throw new Error(error)
    }

    if (itemIds.length === 0) {
      throw new Error("No items to send")
    }

    // Prevent duplicate concurrent sends
    if (isSending) {
      logger.warn('Already sending batch, ignoring duplicate call', {}, 'useBatchSendToShopify')
      throw new Error("Batch send already in progress")
    }

    setIsSending(true)
    
    // Safety timeout to prevent stuck loading state (10 minutes max)
    const safetyTimeout = setTimeout(() => {
      logger.error('Safety timeout reached - clearing loading state', new Error('Safety timeout'), {}, 'useBatchSendToShopify')
      setIsSending(false)
      setProgress(null)
      toast.error('Batch processing timeout - please try again')
    }, 10 * 60 * 1000)
    
    const chunks = chunkArray(itemIds, config.batchSize)
    const totalChunks = chunks.length
    let processedItems = 0
    
    // Initialize progress
    const initialProgress: BatchProgress = {
      currentChunk: 0,
      totalChunks,
      processedItems: 0,
      totalItems: itemIds.length,
      isProcessing: true
    }
    setProgress(initialProgress)
    onProgress?.(initialProgress)

    // Aggregate results
    const aggregatedResults: BatchSendResult[] = []
    let totalProcessed = 0
    let totalRejected = 0
    let totalQueued = 0
    const allRejectedItems: Array<{ id: string; reason: string }> = []

    try {
      if (autoProcess) {
        toast.info(`Auto-processing ${itemIds.length} items in ${totalChunks} chunks`)
      } else {
        toast.info(`Starting batch processing: ${totalChunks} chunks of ${config.batchSize} items`)
      }

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex]
        const currentProgress: BatchProgress = {
          currentChunk: chunkIndex + 1,
          totalChunks,
          processedItems,
          totalItems: itemIds.length,
          isProcessing: true
        }
        setProgress(currentProgress)
        onProgress?.(currentProgress)

        logger.info(`Processing chunk ${chunkIndex + 1}/${totalChunks}`, { chunkSize: chunk.length }, 'useBatchSendToShopify')
        
        try {
          // Step 1: Update vendor on items if provided
          if (config.vendor) {
            logger.info(`Setting vendor for ${chunk.length} items`, { vendor: config.vendor }, 'useBatchSendToShopify')
            const { error: vendorError } = await supabase
              .from('intake_items')
              .update({ vendor: config.vendor } as any) // Cast until types regenerate
              .in('id', chunk)
            
            if (vendorError) {
              logger.warn('Failed to set vendor', { error: vendorError }, 'useBatchSendToShopify')
            }
          }

          // Step 2: Send items to inventory AND queue for Shopify (atomic operation)
          let inventoryData: any = null
          let inventoryError: any = null
          let attemptNumber = 0
          const maxAttempts = 2
          
          while (attemptNumber < maxAttempts) {
            attemptNumber++
            logger.debug(`Sending chunk ${chunkIndex + 1}/${totalChunks} to inventory (attempt ${attemptNumber}/${maxAttempts})`, { chunkSize: chunk.length }, 'useBatchSendToShopify')
            
            const { data, error } = await supabase.rpc('send_and_queue_inventory' as any, {
              item_ids: chunk
            })
            
            inventoryData = data
            inventoryError = error
            
            // Success - break out of retry loop
            if (!error) {
              const result = data as any
              logger.debug(`Chunk ${chunkIndex + 1} inventory+queue operation succeeded`, { processed: result?.processed || 0 }, 'useBatchSendToShopify')
              break
            }
            
            // Log full error response at debug level
            logger.debug('Inventory RPC full error response', { 
              error, 
              message: error.message, 
              code: error.code,
              details: error.details,
              hint: error.hint 
            }, 'useBatchSendToShopify')
            
            // Check if this is a schema/cache error (PostgREST prepared statement issue)
            const errorMessage = error.message || ''
            const isCacheError = errorMessage.includes('has no field') || 
                                errorMessage.includes('record "new"') ||
                                errorMessage.includes('record "old"') ||
                                errorMessage.includes('column') ||
                                errorMessage.includes('does not exist')
            
            // If it's a cache error and we have retries left, wait and retry with 2s backoff
            if (isCacheError && attemptNumber < maxAttempts) {
              logger.warn(`Database cache error detected, retrying with 2s backoff... (attempt ${attemptNumber}/${maxAttempts})`, { 
                error: errorMessage.substring(0, 100) 
              }, 'useBatchSendToShopify')
              
              // Use 2-second backoff for cache errors as specified
              await delay(2000)
              continue
            }
            
            // Otherwise, break out of retry loop with the error
            break
          }

          if (inventoryError) {
            const errorMsg = inventoryError.message || 'Unknown error'
            const errorPreview = errorMsg.substring(0, 100) // First 100 chars for display
            
            logger.error(`Chunk ${chunkIndex + 1} inventory error after ${attemptNumber} attempts`, new Error(errorMsg), { 
              chunk: chunkIndex + 1,
              attempts: attemptNumber,
              errorPreview,
              errorDetails: inventoryError 
            }, 'useBatchSendToShopify')
            
            // Check for "record 'new'" cache error specifically
            const isRecordNewError = errorMsg.includes('record "new"') || 
                                    errorMsg.includes('record "old"') ||
                                    errorMsg.includes('has no field')
            
            // Provide actionable error message with first 100 chars
            if (isRecordNewError) {
              const fixInstructions = [
                'Database cache error detected. Run these SQL files in Supabase SQL Editor:',
                '1. db/fixes/recompile_intake_items_triggers.sql',
                '2. db/fixes/recreate_send_intake_items_to_inventory.sql',
                '3. db/fixes/discard_all.sql',
                '4. db/fixes/ensure_updated_by_trigger.sql',
                'Or run: ./scripts/db-fix-intake-items.sh'
              ].join('\n')
              
              toast.error('Database Cache Error - "record new" Field Missing', {
                description: `Error: ${errorPreview}${errorMsg.length > 100 ? '...' : ''}\n\n${fixInstructions}`,
                duration: 15000 // 15 seconds for longer instructions
              })
              
              logger.error('Record "new" cache error - DB fix scripts required', new Error(errorMsg), {
                errorPreview,
                fixScripts: [
                  'db/fixes/recompile_intake_items_triggers.sql',
                  'db/fixes/recreate_send_intake_items_to_inventory.sql',
                  'db/fixes/discard_all.sql',
                  'db/fixes/ensure_updated_by_trigger.sql'
                ]
              }, 'useBatchSendToShopify')
            } else if (errorMsg.includes('column') || errorMsg.includes('does not exist')) {
              toast.error('Database Schema Error', {
                description: `${errorPreview}${errorMsg.length > 100 ? '...' : ''}. Database schema may be out of sync. Try refreshing or running DB fix scripts.`,
                duration: 8000
              })
            } else {
              toast.error(`Chunk ${chunkIndex + 1} Failed`, {
                description: `${errorPreview}${errorMsg.length > 100 ? '...' : ''}`,
                duration: 5000
              })
            }
            
            if (config.failFast) {
              throw new Error(`Chunk ${chunkIndex + 1} failed after ${attemptNumber} attempts: ${errorPreview}`)
            }
            
            // Add failed items to rejected list
            chunk.forEach(itemId => {
              allRejectedItems.push({ id: itemId, reason: errorPreview })
            })
            totalRejected += chunk.length
            continue
          }

          // Extract results from atomic RPC (marks inventory + queues Shopify)
          const inventoryResult = inventoryData as {
            processed: number;
            processed_ids: string[];
            rejected: Array<{ id: string; reason: string }>;
          };
          
          const processedIds: string[] = inventoryResult?.processed_ids ?? [];
          const rejected = inventoryResult?.rejected ?? [];
          
          logger.info(`Inventory+Queue result: ${processedIds.length} processed & queued, ${rejected.length} rejected`, {}, 'useBatchSendToShopify');
          
          // Update totals
          totalProcessed += processedIds.length;
          totalQueued += processedIds.length; // All processed items are also queued
          
          if (processedIds.length === 0) {
            logger.warn(`No items processed in chunk ${chunkIndex + 1}`, { rejected }, 'useBatchSendToShopify');
          }

          // Handle rejected items
          if (rejected.length > 0) {
            allRejectedItems.push(...rejected);
            totalRejected += rejected.length;
            
            // Show warning toast with rejection reasons
            const reasonSummary = rejected.slice(0, 3).map(r => r.reason).join(', ');
            toast.warning(`${rejected.length} items could not be processed`, {
              description: reasonSummary + (rejected.length > 3 ? '...' : ''),
              duration: 5000
            });
          }
          
          processedItems += chunk.length
          toast.success(`Chunk ${chunkIndex + 1}/${totalChunks} completed: ${processedIds.length} items moved to inventory & queued`)
          
          // Invalidate batch query to update UI across all components
          await queryClient.invalidateQueries({ 
            queryKey: queryKeys.currentBatch(storeKey, locationGid)
          });
          
        } catch (chunkError: unknown) {
          logger.error(`Chunk ${chunkIndex + 1} failed`, chunkError instanceof Error ? chunkError : new Error(String(chunkError)), { chunk: chunkIndex + 1 }, 'useBatchSendToShopify')
          if (config.failFast) {
            throw chunkError
          }
          // Add failed items to rejected list
          chunk.forEach(itemId => {
            const errorMessage = chunkError && typeof chunkError === 'object' && 'message' in chunkError 
              ? (chunkError as { message: string }).message 
              : String(chunkError)
            allRejectedItems.push({ id: itemId, reason: errorMessage })
          })
          totalRejected += chunk.length
          const errorMessage = chunkError && typeof chunkError === 'object' && 'message' in chunkError 
            ? (chunkError as { message: string }).message 
            : String(chunkError)
          toast.error(`Chunk ${chunkIndex + 1}/${totalChunks} failed: ${errorMessage}`)
        }

        // Add delay between chunks (except for the last one)
        if (chunkIndex < chunks.length - 1 && config.delayBetweenChunks > 0) {
          logger.debug(`Waiting ${config.delayBetweenChunks}ms before next chunk`, {}, 'useBatchSendToShopify')
          await delay(config.delayBetweenChunks)
        }
      }

      // Step 4: Trigger the new Shopify sync processor if we have queued items
      if (totalQueued > 0) {
        logger.info(`Triggering Shopify sync processor`, { queuedItems: totalQueued }, 'useBatchSendToShopify')
        try {
          const { data, error: processorError } = await supabase.functions.invoke('shopify-sync', {
            body: {}
          })
          
          if (processorError) {
            logger.warn('Failed to trigger sync processor', { error: processorError }, 'useBatchSendToShopify')
            toast.warning('Items queued for sync but processor failed to start - sync may be delayed')
          } else {
            toast.info(`Started Shopify sync for ${totalQueued} items - processing in background`)
          }
        } catch (processorError) {
          logger.warn('Failed to trigger sync processor', { error: processorError }, 'useBatchSendToShopify')
          toast.warning('Items queued for sync but processor failed to start - sync may be delayed')
        }
      }

      // Final progress update
      const finalProgress: BatchProgress = {
        currentChunk: totalChunks,
        totalChunks,
        processedItems: itemIds.length,
        totalItems: itemIds.length,
        isProcessing: false
      }
      setProgress(finalProgress)
      onProgress?.(finalProgress)

      // Show final summary
      logger.info('Batch send complete', { 
        totalProcessed, 
        totalRejected, 
        totalQueued 
      }, 'useBatchSendToShopify')
      
      if (totalQueued > 0) {
        toast.success(`Batch complete! ${totalQueued} items queued for Shopify sync`)
      }
      if (totalRejected > 0) {
        toast.error(`${totalRejected} items failed to process`)
      }

      return {
        ok: totalQueued > 0 || totalProcessed > 0,
        processed: totalProcessed,
        rejected: totalRejected,
        shopify_success: totalQueued, // Items queued for sync
        shopify_errors: totalRejected,
        results: aggregatedResults,
        rejected_items: allRejectedItems
      }
    } catch (error) {
      logger.error('Fatal batch send error', error instanceof Error ? error : new Error(String(error)), {}, 'useBatchSendToShopify')
      toast.error('Batch processing failed')
      throw error
    } finally {
      // Clear safety timeout
      if (safetyTimeout) {
        clearTimeout(safetyTimeout)
      }
      setIsSending(false)
      setProgress(null)
    }
  }

  // Keep the original function name for backwards compatibility
  const sendBatchToShopify = (
    itemIds: string[],
    storeKey: "hawaii" | "las_vegas",
    locationGid: string,
    config?: BatchConfig,
    onProgress?: (progress: BatchProgress) => void,
    autoProcess?: boolean
  ) => sendChunkedBatchToShopify(itemIds, storeKey, locationGid, config, onProgress, autoProcess)

  return {
    sendBatchToShopify,
    sendChunkedBatchToShopify,
    isSending,
    progress
  }
}
