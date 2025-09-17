import { supabase } from "@/integrations/supabase/client"

// Function to check for queued items and trigger processor
export async function checkAndTriggerProcessor() {
  try {
    // Check if there are queued items
    const { data: queuedItems, error } = await supabase
      .from('shopify_sync_queue')
      .select('id')
      .eq('status', 'queued')
      .is('retry_after', null)
      .limit(1)

    if (error || !queuedItems || queuedItems.length === 0) {
      return { triggered: false, reason: 'No queued items' }
    }

    // Trigger the processor
    const { error: triggerError } = await supabase.functions.invoke('shopify-sync-processor', {
      body: {}
    })

    if (triggerError) {
      console.error('Failed to trigger processor:', triggerError)
      return { triggered: false, reason: 'Trigger failed', error: triggerError }
    }

    console.log('Processor triggered successfully for', queuedItems.length, 'queued items')
    return { triggered: true, itemCount: queuedItems.length }

  } catch (error) {
    console.error('Error in auto-trigger:', error)
    return { triggered: false, reason: 'Error', error }
  }
}

// Auto-trigger processor when items are sent to inventory
export async function autoTriggerAfterInventoryUpdate() {
  // Wait a moment for database updates to complete
  setTimeout(async () => {
    await checkAndTriggerProcessor()
  }, 1000)
}