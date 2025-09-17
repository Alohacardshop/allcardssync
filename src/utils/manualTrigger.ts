import { supabase } from "@/integrations/supabase/client"

// Immediately trigger the processor for the current queued item
export async function immediatelyTriggerProcessor() {
  try {
    console.log('🚀 Triggering Shopify sync processor immediately...')
    
    const { data, error } = await supabase.functions.invoke('shopify-sync-processor', {
      body: { immediate: true }
    })
    
    if (error) {
      console.error('❌ Failed to trigger processor:', error)
      return { success: false, error }
    }
    
    console.log('✅ Processor triggered successfully:', data)
    return { success: true, data }
    
  } catch (error) {
    console.error('💥 Error triggering processor:', error)
    return { success: false, error }
  }
}

// Call this immediately when the file loads to process any queued items
immediatelyTriggerProcessor().then(result => {
  if (result.success) {
    console.log('✅ Auto-triggered processor on page load')
  } else {
    console.log('⚠️ Failed to auto-trigger processor:', result.error)
  }
})