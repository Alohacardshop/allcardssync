import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"

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

  const sendBatchToShopify = async (
    itemIds: string[],
    storeKey: "hawaii" | "las_vegas",
    locationGid: string
  ): Promise<BatchSendResponse> => {
    console.log(`🔵 [useBatchSendToShopify] Starting batch send:`, { 
      itemCount: itemIds.length, 
      storeKey, 
      locationGid: locationGid?.substring(0, 20) + '...' 
    })
    
    if (!storeKey || !locationGid) {
      const error = "Store and location must be selected"
      console.error(`❌ [useBatchSendToShopify] Validation failed:`, error)
      throw new Error(error)
    }

    setIsSending(true)
    
    try {
      console.log(`🚀 [useBatchSendToShopify] Calling v2-batch-send-to-inventory edge function`)
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Edge function timeout after 30 seconds')), 30000)
      })

      const functionPromise = supabase.functions.invoke("v2-batch-send-to-inventory", {
        body: {
          itemIds,
          storeKey,
          locationGid
        }
      })

      const { data, error } = await Promise.race([functionPromise, timeoutPromise]) as any

      console.log(`📡 [useBatchSendToShopify] Edge function response:`, { data, error })

      if (error) {
        console.error(`❌ [useBatchSendToShopify] Edge function error:`, error)
        throw new Error(`Batch send failed: ${error.message}`)
      }

      if (!data?.ok) {
        console.error(`❌ [useBatchSendToShopify] Edge function returned not ok:`, data)
        throw new Error(data?.error || "Batch send failed")
      }

      // Show success summary
      const { shopify_success, shopify_errors, processed } = data
      console.log(`✅ [useBatchSendToShopify] Success summary:`, { shopify_success, shopify_errors, processed })
      
      if (shopify_success > 0) {
        toast.success(`Successfully sent ${shopify_success} items to Shopify`)
      }
      if (shopify_errors > 0) {
        toast.error(`${shopify_errors} items failed to sync to Shopify`)
      }

      return data
    } finally {
      setIsSending(false)
    }
  }

  return {
    sendBatchToShopify,
    isSending
  }
}