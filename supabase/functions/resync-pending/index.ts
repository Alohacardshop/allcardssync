import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type LogLevel = 'INFO'|'WARN'|'ERROR'
const log = (level: LogLevel, msg: string, fields: Record<string, any> = {}) =>
  console.log(JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() }))

function normalizeGameSlug(gameInput: string): string {
  const g0 = (gameInput || '').toLowerCase()
  if (g0 === 'pokemon_japan') return 'pokemon-japan'
  if (g0 === 'mtg') return 'magic-the-gathering'
  return g0
}

async function resyncPendingForGame(gameInput: string) {
  const game = normalizeGameSlug(gameInput)
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  // Get pending sets from the view
  const { data: rows, error } = await supabase
    .from('catalog_v2_pending_sets')
    .select('set_id')
    .eq('game', game)
    
  if (error) {
    log('ERROR', 'resync:query-failed', { game, error: error.message })
    throw error
  }

  const setIds = (rows ?? []).map(r => r.set_id)
  log('INFO', 'resync:pending-start', { game, count: setIds.length, setIds })

  // No work needed
  if (setIds.length === 0) {
    return { ok: true, game, message: 'No pending sets', count: 0 }
  }

  // Call the catalog-sync endpoint for those setIds
  const functionsUrl = `${supabaseUrl}/functions/v1`
  const syncUrl = `${functionsUrl}/catalog-sync?game=${encodeURIComponent(game)}`
  
  const syncResponse = await fetch(syncUrl, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ setIds })
  })

  const responseText = await syncResponse.text()
  
  if (!syncResponse.ok) {
    log('ERROR', 'resync:pending-failed', { 
      game, 
      status: syncResponse.status, 
      text: responseText.slice(0, 500) 
    })
    return { 
      ok: false, 
      game, 
      status: syncResponse.status, 
      error: responseText,
      count: setIds.length 
    }
  }

  log('INFO', 'resync:pending-dispatched', { 
    game, 
    count: setIds.length, 
    response: responseText.slice(0, 200) 
  })
  
  return { ok: true, game, count: setIds.length, message: 'Sync dispatched successfully' }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    const { game } = await req.json()
    
    if (!game) {
      return new Response(
        JSON.stringify({ error: 'Game parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const result = await resyncPendingForGame(game)
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    log('ERROR', 'resync:handler-error', { error: error.message })
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || 'Unknown error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})