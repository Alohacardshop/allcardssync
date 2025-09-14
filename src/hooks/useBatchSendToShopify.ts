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
    let totalShopifySuccess = 0
    let totalShopifyErrors = 0
    const allRejectedItems: Array<{ id: string; reason: string }> = []

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
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Edge function timeout after 30 seconds')), 30000)
          })

          const functionPromise = supabase.functions.invoke("v2-batch-send-to-inventory", {
            body: {
              itemIds: chunk,
              storeKey,
              locationGid
            }
          })

          const { data, error } = await Promise.race([functionPromise, timeoutPromise]) as any

          if (error) {
            console.error(`❌ [useBatchSendToShopify] Chunk ${chunkIndex + 1} error:`, error)
            if (config.failFast) {
              throw new Error(`Chunk ${chunkIndex + 1} failed: ${error.message}`)
            }
            // Add failed items to rejected list
            chunk.forEach(itemId => {
              allRejectedItems.push({ id: itemId, reason: error.message })
            })
            totalRejected += chunk.length
          } else if (!data?.ok) {
            console.error(`❌ [useBatchSendToShopify] Chunk ${chunkIndex + 1} returned not ok:`, data)
            if (config.failFast) {
              throw new Error(`Chunk ${chunkIndex + 1} failed: ${data?.error || "Unknown error"}`)
            }
            chunk.forEach(itemId => {
              allRejectedItems.push({ id: itemId, reason: data?.error || "Unknown error" })
            })
            totalRejected += chunk.length
          } else {
            // Success - aggregate results
            console.log(`✅ [useBatchSendToShopify] Chunk ${chunkIndex + 1} success:`, data)
            aggregatedResults.push(...(data.results || []))
            totalProcessed += data.processed || 0
            totalShopifySuccess += data.shopify_success || 0
            totalShopifyErrors += data.shopify_errors || 0
            if (data.rejected_items) {
              allRejectedItems.push(...data.rejected_items)
              totalRejected += data.rejected_items.length
            }
            
            processedItems += chunk.length
            toast.success(`Chunk ${chunkIndex + 1}/${totalChunks} completed: ${data.shopify_success || 0} items synced`)
          }
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
        totalShopifySuccess, 
        totalShopifyErrors 
      })
      
      if (totalShopifySuccess > 0) {
        toast.success(`Batch complete! Successfully sent ${totalShopifySuccess} items to Shopify`)
      }
      if (totalShopifyErrors > 0 || totalRejected > 0) {
        toast.error(`${totalShopifyErrors + totalRejected} items failed to sync`)
      }

      return {
        ok: totalShopifySuccess > 0 || totalProcessed > 0,
        processed: totalProcessed,
        rejected: totalRejected,
        shopify_success: totalShopifySuccess,
        shopify_errors: totalShopifyErrors,
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