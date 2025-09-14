import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"

export interface ValidationResult {
  itemId: string
  shopifyProductId?: string
  status: 'valid' | 'invalid' | 'missing' | 'error'
  issues: string[]
  shopifyData?: any
  inventoryData?: any
}

export function useShopifyValidation() {
  const [validating, setValidating] = useState(false)
  const [results, setResults] = useState<ValidationResult[]>([])

  const validateSyncedItems = async (itemIds: string[]) => {
    setValidating(true)
    const validationResults: ValidationResult[] = []

    try {
      for (const itemId of itemIds) {
        try {
          // Get inventory item
          const { data: inventoryItem, error: inventoryError } = await supabase
            .from('intake_items')
            .select('*')
            .eq('id', itemId)
            .single()

          if (inventoryError || !inventoryItem) {
            validationResults.push({
              itemId,
              status: 'error',
              issues: ['Inventory item not found']
            })
            continue
          }

          if (!inventoryItem.shopify_product_id) {
            validationResults.push({
              itemId,
              status: 'missing',
              issues: ['No Shopify product ID'],
              inventoryData: inventoryItem
            })
            continue
          }

          // Call validation function
          const { data: validationData, error: validationError } = await supabase.functions.invoke(
            'shopify-validate-sync',
            {
              body: {
                itemId,
                shopifyProductId: inventoryItem.shopify_product_id,
                storeKey: inventoryItem.store_key
              }
            }
          )

          if (validationError) {
            validationResults.push({
              itemId,
              shopifyProductId: inventoryItem.shopify_product_id,
              status: 'error',
              issues: [validationError.message],
              inventoryData: inventoryItem
            })
            continue
          }

          const validation = validationData
          const issues: string[] = []

          // Check if product exists
          if (!validation.shopifyExists) {
            issues.push('Product not found in Shopify')
          }

          // Price validation
          if (validation.shopifyExists && validation.shopifyPrice !== null) {
            const priceDiff = Math.abs(validation.shopifyPrice - (inventoryItem.price || 0))
            if (priceDiff > 0.01) {
              issues.push(`Price mismatch: Shopify $${validation.shopifyPrice}, Inventory $${inventoryItem.price || 0}`)
            }
          }

          // Inventory validation
          if (validation.shopifyExists && validation.shopifyQuantity !== null) {
            if (validation.shopifyQuantity !== (inventoryItem.quantity || 0)) {
              issues.push(`Quantity mismatch: Shopify ${validation.shopifyQuantity}, Inventory ${inventoryItem.quantity || 0}`)
            }
          }

          // Title validation
          if (validation.shopifyExists && validation.shopifyTitle) {
            const expectedTitle = generateExpectedTitle(inventoryItem)
            if (!validation.shopifyTitle.includes(inventoryItem.sku || '')) {
              issues.push('Title may not match expected format')
            }
          }

          validationResults.push({
            itemId,
            shopifyProductId: inventoryItem.shopify_product_id,
            status: issues.length === 0 ? 'valid' : 'invalid',
            issues,
            shopifyData: validation,
            inventoryData: inventoryItem
          })

        } catch (error) {
          console.error(`Error validating item ${itemId}:`, error)
          validationResults.push({
            itemId,
            status: 'error',
            issues: [error instanceof Error ? error.message : 'Unknown error']
          })
        }
      }

      setResults(validationResults)
      return validationResults

    } catch (error) {
      console.error('Error during validation:', error)
      throw error
    } finally {
      setValidating(false)
    }
  }

  const resyncItem = async (itemId: string) => {
    try {
      // Add item back to sync queue with 'update' action
      const { error } = await supabase.rpc('queue_shopify_sync', {
        item_id: itemId,
        sync_action: 'update'
      })

      if (error) throw error

      // Update validation results to remove this item
      setResults(prev => prev.filter(result => result.itemId !== itemId))

      return true
    } catch (error) {
      console.error('Error resyncing item:', error)
      throw error
    }
  }

  return {
    validating,
    results,
    validateSyncedItems,
    resyncItem
  }
}

function generateExpectedTitle(item: any): string {
  if (item.type === 'Graded') {
    return `${item.brand_title || ''} ${item.subject || ''} #${item.card_number || ''} ${item.grade || ''} ${item.psa_cert || ''}`.trim()
  } else {
    return `${item.brand_title || ''} ${item.subject || ''} ${item.card_number || ''}`.trim()
  }
}