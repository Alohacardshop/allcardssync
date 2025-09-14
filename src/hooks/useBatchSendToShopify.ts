import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"

export interface BatchConfig {
  batchSize: number
  delayBetweenChunks: number
  failFast: boolean
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
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)

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

  const isRateLimitError = (error: any): boolean => {
    return error?.message?.includes('429') || 
           error?.status === 429 || 
           error?.message?.toLowerCase().includes('rate limit') ||
           error?.message?.toLowerCase().includes('too many requests')
  }

  const sendChunkedBatchToShopify = async (
    itemIds: string[],
    storeKey: "hawaii" | "las_vegas",
    locationGid: string,
    config: BatchConfig = { batchSize: 5, delayBetweenChunks: 1000, failFast: false },
    onProgress?: (progress: BatchProgress) => void
  ): Promise<BatchSendResponse> => {
    console.log(`🔵 [useBatchSendToShopify] Starting chunked batch send:`, { 
      itemCount: itemIds.length, 
      storeKey, 
      locationGid: locationGid?.substring(0, 20) + '...',
      config
    })
    
    if (!storeKey || !locationGid) {
      const error = "Store and location must be selected"
      console.error(`❌ [useBatchSendToShopify] Validation failed:`, error)
      throw new Error(error)
    }

    if (itemIds.length === 0) {
      throw new Error("No items to send")
    }

    setIsSending(true)
    
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
    const allQueuedItems: string[] = []

    try {
      toast.info(`Starting batch processing: ${totalChunks} chunks of ${config.batchSize} items`)

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

        console.log(`🔄 [useBatchSendToShopify] Processing chunk ${chunkIndex + 1}/${totalChunks} with ${chunk.length} items`)
        
        try {
          // Step 1: Send items to inventory (without Shopify sync)
          const { data: inventoryData, error: inventoryError } = await supabase.rpc('send_intake_items_to_inventory', {
            item_ids: chunk
          })

          if (inventoryError) {
            console.error(`❌ [useBatchSendToShopify] Chunk ${chunkIndex + 1} inventory error:`, inventoryError)
            
            if (config.failFast) {
              throw new Error(`Chunk ${chunkIndex + 1} failed: ${inventoryError.message}`)
            }
            // Add failed items to rejected list
            chunk.forEach(itemId => {
              allRejectedItems.push({ id: itemId, reason: inventoryError.message })
            })
            totalRejected += chunk.length
            continue
          }

          // Step 2: Queue successful items for Shopify sync
          const inventoryResult = inventoryData as any
          if (inventoryResult?.processed_ids && inventoryResult.processed_ids.length > 0) {
            console.log(`📋 [useBatchSendToShopify] Queueing ${inventoryResult.processed_ids.length} items for Shopify sync`)
            
            for (const itemId of inventoryResult.processed_ids) {
              try {
                const { error: queueError } = await supabase.rpc('queue_shopify_sync', {
                  item_id: itemId,
                  sync_action: 'create'
                })

                if (queueError) {
                  console.error(`❌ [useBatchSendToShopify] Failed to queue item ${itemId}:`, queueError)
                  allRejectedItems.push({ id: itemId, reason: `Queue failed: ${queueError.message}` })
                  totalRejected++
                } else {
                  allQueuedItems.push(itemId)
                  totalQueued++
                }
              } catch (queueError: any) {
                console.error(`❌ [useBatchSendToShopify] Failed to queue item ${itemId}:`, queueError)
                allRejectedItems.push({ id: itemId, reason: `Queue failed: ${queueError.message}` })
                totalRejected++
              }
            }

            totalProcessed += inventoryResult.processed_ids.length
          }

          // Handle rejected items from inventory step
          if (inventoryResult?.rejected && inventoryResult.rejected.length > 0) {
            allRejectedItems.push(...inventoryResult.rejected)
            totalRejected += inventoryResult.rejected.length
          }
          
          processedItems += chunk.length
          toast.success(`Chunk ${chunkIndex + 1}/${totalChunks} completed: ${inventoryResult?.processed_ids?.length || 0} items moved to inventory`)
          
        } catch (chunkError: any) {
          console.error(`❌ [useBatchSendToShopify] Chunk ${chunkIndex + 1} failed:`, chunkError)
          if (config.failFast) {
            throw chunkError
          }
          // Add failed items to rejected list
          chunk.forEach(itemId => {
            allRejectedItems.push({ id: itemId, reason: chunkError.message })
          })
          totalRejected += chunk.length
          toast.error(`Chunk ${chunkIndex + 1}/${totalChunks} failed: ${chunkError.message}`)
        }

        // Add delay between chunks (except for the last one)
        if (chunkIndex < chunks.length - 1 && config.delayBetweenChunks > 0) {
          console.log(`⏳ [useBatchSendToShopify] Waiting ${config.delayBetweenChunks}ms before next chunk`)
          await delay(config.delayBetweenChunks)
        }
      }

      // Step 3: Trigger the Shopify sync processor if we have queued items
      if (totalQueued > 0) {
        console.log(`🚀 [useBatchSendToShopify] Triggering Shopify sync processor for ${totalQueued} queued items`)
        try {
          await supabase.functions.invoke('shopify-sync-processor', { body: {} })
          toast.info(`Started Shopify sync for ${totalQueued} items - processing in background`)
        } catch (processorError) {
          console.error(`⚠️ [useBatchSendToShopify] Failed to trigger sync processor:`, processorError)
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
      console.log(`🏁 [useBatchSendToShopify] Final summary:`, { 
        totalProcessed, 
        totalRejected, 
        totalQueued 
      })
      
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
    } finally {
      setIsSending(false)
      setProgress(null)
    }
  }

  // Keep the original function name for backwards compatibility
  const sendBatchToShopify = (
    itemIds: string[],
    storeKey: "hawaii" | "las_vegas",
    locationGid: string
  ) => sendChunkedBatchToShopify(itemIds, storeKey, locationGid)

  return {
    sendBatchToShopify,
    sendChunkedBatchToShopify,
    isSending,
    progress
  }
}
