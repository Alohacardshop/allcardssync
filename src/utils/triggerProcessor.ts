import { supabase } from "@/integrations/supabase/client"

export async function triggerShopifyProcessor() {
  try {
    const { data, error } = await supabase.functions.invoke('shopify-sync-processor', {
      body: {}
    })
    
    if (error) {
      console.error('Error triggering processor:', error)
      throw error
    }
    
    console.log('Processor triggered successfully:', data)
    return data
  } catch (err) {
    console.error('Failed to trigger processor:', err)
    throw err
  }
}