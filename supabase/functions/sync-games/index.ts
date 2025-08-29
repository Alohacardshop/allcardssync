import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface JustTCGGame {
  id: string
  name: string
  active: boolean
}

const GAME_MAPPING: Record<string, string> = {
  'magic-the-gathering': 'mtg',
  'pokemon': 'pokemon',
  'yugioh': 'yugioh'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const justTcgApiKey = Deno.env.get('JUSTTCG_API_KEY')
  if (!justTcgApiKey) {
    console.error('JUSTTCG_API_KEY not found')
    return new Response(
      JSON.stringify({ error: 'API key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let jobId: string | null = null

  try {
    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('catalog_v2.sync_jobs')
      .insert({
        job_type: 'games',
        status: 'running',
        started_at: new Date().toISOString(),
        progress: { current: 0, total: 0 }
      })
      .select()
      .single()

    if (jobError) {
      console.error('Failed to create sync job:', jobError)
      throw new Error('Failed to create sync job')
    }

    jobId = job.id

    console.log(`Starting games sync - Job ID: ${jobId}`)

    // Fetch games from JustTCG API
    const response = await fetch('https://api.justtcg.com/v1/games', {
      headers: {
        'x-api-key': justTcgApiKey,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`JustTCG API error: ${response.status} ${response.statusText}`)
    }

    const gamesData = await response.json() as JustTCGGame[]
    console.log(`Fetched ${gamesData.length} games from JustTCG API`)

    // Update job with total count
    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        progress: { current: 0, total: gamesData.length }
      })
      .eq('id', jobId)

    let processedCount = 0
    const upsertedGames = []

    for (const game of gamesData) {
      try {
        const internalSlug = GAME_MAPPING[game.id] || game.id

        // Upsert game to catalog_v2.games
        const { data: upsertedGame, error: upsertError } = await supabase
          .from('catalog_v2.games')
          .upsert({
            id: internalSlug,
            name: game.name,
            justtcg_id: game.id,
            active: game.active
          })
          .select()

        if (upsertError) {
          console.error(`Failed to upsert game ${game.id}:`, upsertError)
          continue
        }

        upsertedGames.push(upsertedGame)
        processedCount++

        console.log(`Processed game: ${game.name} (${game.id} -> ${internalSlug})`)

        // Update progress
        await supabase
          .from('catalog_v2.sync_jobs')
          .update({
            progress: { current: processedCount, total: gamesData.length }
          })
          .eq('id', jobId)

      } catch (error) {
        console.error(`Error processing game ${game.id}:`, error)
        continue
      }
    }

    // Mark job as completed
    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: processedCount, total: gamesData.length },
        metadata: { 
          processedGames: processedCount,
          totalGames: gamesData.length,
          upsertedCount: upsertedGames.length
        }
      })
      .eq('id', jobId)

    console.log(`Games sync completed - Processed: ${processedCount}/${gamesData.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        processed: processedCount,
        total: gamesData.length,
        upserted: upsertedGames.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Games sync error:', error)

    // Update job status to failed
    if (jobId) {
      await supabase
        .from('catalog_v2.sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message
        })
        .eq('id', jobId)
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        jobId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})