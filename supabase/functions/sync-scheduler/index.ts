import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get enabled schedules that are due to run
    const { data: schedules, error } = await supabase
      .from('sync_v3.schedules')
      .select('*')
      .eq('enabled', true)
      .lte('next_run', new Date().toISOString())

    if (error) throw error

    const results = []

    for (const schedule of schedules || []) {
      try {
        console.log(`Running scheduled job: ${schedule.name}`)
        
        // Determine the sync endpoint based on job type
        let endpoint = ''
        switch (schedule.job_type) {
          case 'games':
            endpoint = '/functions/v1/sync-games-v2'
            break
          case 'sets':
            endpoint = '/functions/v1/sync-sets-v2'
            break
          case 'cards':
            endpoint = '/functions/v1/sync-cards-v2'
            break
          default:
            throw new Error(`Unknown job type: ${schedule.job_type}`)
        }

        // Trigger the sync job
        const response = await fetch(`${supabaseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify(schedule.config || {})
        })

        if (!response.ok) {
          throw new Error(`Sync request failed: ${response.status}`)
        }

        const result = await response.json()
        
        // Calculate next run time (simple daily increment for now)
        const nextRun = new Date()
        nextRun.setDate(nextRun.getDate() + 1)
        nextRun.setHours(2, 0, 0, 0) // 2 AM next day

        // Update schedule
        await supabase
          .from('sync_v3.schedules')
          .update({
            last_run: new Date().toISOString(),
            next_run: nextRun.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', schedule.id)

        results.push({
          schedule_id: schedule.id,
          schedule_name: schedule.name,
          status: 'success',
          job_id: result.job_id,
          next_run: nextRun.toISOString()
        })

      } catch (error) {
        console.error(`Schedule ${schedule.name} failed:`, error)
        
        results.push({
          schedule_id: schedule.id,
          schedule_name: schedule.name,
          status: 'failed',
          error: error.message
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${results.length} scheduled jobs`,
      results,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Scheduler error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})