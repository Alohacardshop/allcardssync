import { supabase } from "@/integrations/supabase/client"

export async function triggerShopifyProcessor() {
  try {
    console.log('🚀 Manually triggering Shopify sync processor...')
    
    const { data, error } = await supabase.functions.invoke('shopify-sync-processor', {
      body: {}
    })
    
    if (error) {
      console.error('❌ Error triggering processor:', error)
      throw error
    }
    
    console.log('✅ Processor triggered successfully:', data)
    return data
  } catch (err) {
    console.error('💥 Failed to trigger processor:', err)
    throw err
  }
}

// Trigger processor and check result
export async function triggerAndMonitorProcessor() {
  const result = await triggerShopifyProcessor()
  
  // Wait a moment then check queue status
  setTimeout(async () => {
    const { data: queueStatus } = await supabase
      .from('shopify_sync_queue')
      .select('status')
      .eq('status', 'processing')
    
    if (queueStatus && queueStatus.length > 0) {
      console.log('✅ Processor is actively processing items')
    } else {
      console.log('ℹ️ No items currently being processed')
    }
  }, 2000)
  
  return result
}