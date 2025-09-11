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
    if (!storeKey || !locationGid) {
      throw new Error("Store and location must be selected")
    }

    setIsSending(true)
    
    try {
      const { data, error } = await supabase.functions.invoke("v2-batch-send-to-inventory", {
        body: {
          itemIds,
          storeKey,
          locationGid
        }
      })

      if (error) {
        throw new Error(`Batch send failed: ${error.message}`)
      }

      if (!data?.ok) {
        throw new Error(data?.error || "Batch send failed")
      }

      // Show success summary
      const { shopify_success, shopify_errors, processed } = data
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