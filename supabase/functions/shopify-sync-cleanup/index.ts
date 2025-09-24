import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('🧹 Starting Shopify sync queue cleanup...')

    // Get cleanup settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('key_name, key_value')
      .in('key_name', ['SHOPIFY_CLEANUP_DAYS', 'SHOPIFY_CLEANUP_ENABLED'])

    const settingsMap = settings?.reduce((acc: any, setting) => {
      acc[setting.key_name] = setting.key_value
      return acc
    }, {}) || {}

    const cleanupDays = parseInt(settingsMap.SHOPIFY_CLEANUP_DAYS || '30')
    const cleanupEnabled = settingsMap.SHOPIFY_CLEANUP_ENABLED !== 'false'

    if (!cleanupEnabled) {
      console.log('⏸️ Cleanup is disabled')
      return new Response(
        JSON.stringify({ success: true, message: 'Cleanup is disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - cleanupDays)

    console.log(`🗑️ Cleaning up completed items older than ${cleanupDays} days (before ${cutoffDate.toISOString()})`)

    // Delete old completed items
    const { data: deletedCompleted, error: deleteCompletedError } = await supabase
      .from('shopify_sync_queue')
      .delete()
      .eq('status', 'completed')
      .lt('completed_at', cutoffDate.toISOString())

    if (deleteCompletedError) {
      console.error('❌ Error deleting completed items:', deleteCompletedError)
    }

    // Delete old failed items that have exceeded max retries and are very old (7+ days)
    const oldFailedCutoff = new Date()
    oldFailedCutoff.setDate(oldFailedCutoff.getDate() - 7)

    const { data: deletedFailed, error: deleteFailedError } = await supabase
      .from('shopify_sync_queue')
      .delete()
      .eq('status', 'failed')
      .gte('retry_count', 3) // Only delete items that have been retried
      .lt('created_at', oldFailedCutoff.toISOString())

    if (deleteFailedError) {
      console.error('❌ Error deleting old failed items:', deleteFailedError)
    }

    // Clean up webhook events older than specified days
    const { data: deletedWebhooks, error: deleteWebhooksError } = await supabase
      .from('webhook_events')
      .delete()
      .lt('created_at', cutoffDate.toISOString())

    if (deleteWebhooksError) {
      console.error('❌ Error deleting old webhook events:', deleteWebhooksError)
    }

    // Clean up old system logs (keep last 90 days)
    const logsCutoff = new Date()
    logsCutoff.setDate(logsCutoff.getDate() - 90)

    const { data: deletedLogs, error: deleteLogsError } = await supabase
      .from('system_logs')
      .delete()
      .lt('created_at', logsCutoff.toISOString())
      .neq('level', 'ERROR') // Keep error logs longer

    if (deleteLogsError) {
      console.error('❌ Error deleting old system logs:', deleteLogsError)
    }

    // Reset stuck processing items (older than 1 hour)
    const stuckCutoff = new Date()
    stuckCutoff.setHours(stuckCutoff.getHours() - 1)

    const { data: resetStuck, error: resetStuckError } = await supabase
      .from('shopify_sync_queue')
      .update({
        status: 'queued',
        started_at: null,
        error_message: 'Reset from stuck processing state'
      })
      .eq('status', 'processing')
      .lt('started_at', stuckCutoff.toISOString())

    if (resetStuckError) {
      console.error('❌ Error resetting stuck items:', resetStuckError)
    }

    // Get final stats
    const { data: finalStats, error: statsError } = await supabase
      .from('shopify_sync_queue')
      .select('status')

    const stats = finalStats?.reduce((acc: any, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {}) || {}

    const result = {
      success: true,
      cleanupStats: {
        completedDeleted: (deletedCompleted as any)?.length ?? 0,
        failedDeleted: (deletedFailed as any)?.length ?? 0,
        webhooksDeleted: (deletedWebhooks as any)?.length ?? 0,
        logsDeleted: (deletedLogs as any)?.length ?? 0,
        stuckReset: (resetStuck as any)?.length ?? 0,
        cutoffDate: cutoffDate.toISOString(),
        cleanupDays
      },
      currentStats: stats
    }

    console.log('✅ Cleanup completed:', result.cleanupStats)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Cleanup error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
