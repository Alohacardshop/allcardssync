import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface JustTCGSet {
  id: string
  name: string
  series?: string
  released_at?: string
  total?: number
  printed_total?: number
}

interface JustTCGResponse {
  data: JustTCGSet[]
  total: number
  offset: number
  limit: number
}

const GAME_TO_JUSTTCG: Record<string, string> = {
  'mtg': 'magic-the-gathering',
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
    const { game } = await req.json()

    if (!game) {
      throw new Error('Game parameter is required')
    }

    const justTcgGame = GAME_TO_JUSTTCG[game] || game

    console.log(`Starting sets sync for game: ${game} (JustTCG: ${justTcgGame})`)

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('catalog_v2.sync_jobs')
      .insert({
        job_type: 'sets',
        game_slug: game,
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

    let offset = 0
    const limit = 100
    let totalSets = 0
    let processedCount = 0
    let newSets = 0
    let updatedSets = 0
    let hasMore = true

    while (hasMore) {
      const url = `https://api.justtcg.com/v1/sets?game=${justTcgGame}&limit=${limit}&offset=${offset}`
      console.log(`Fetching sets: ${url}`)

      const response = await fetch(url, {
        headers: {
          'x-api-key': justTcgApiKey,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`JustTCG API error: ${response.status} ${response.statusText}`)
      }

      const responseData = await response.json() as JustTCGResponse
      const sets = responseData.data || []

      if (offset === 0) {
        totalSets = responseData.total || sets.length
        await supabase
          .from('catalog_v2.sync_jobs')
          .update({
            progress: { current: 0, total: totalSets }
          })
          .eq('id', jobId)
        console.log(`Total sets to process: ${totalSets}`)
      }

      for (const set of sets) {
        try {
          // Check if set already exists
          const { data: existingSet } = await supabase
            .from('catalog_v2.sets')
            .select('sync_status')
            .eq('provider', 'justtcg')
            .eq('set_id', set.id)
            .eq('game', game)
            .single()

          const setData = {
            provider: 'justtcg',
            set_id: set.id,
            game,
            name: set.name,
            series: set.series || null,
            total: set.total || null,
            printed_total: set.printed_total || null,
            release_date: set.released_at ? new Date(set.released_at).toISOString().split('T')[0] : null,
            justtcg_set_id: set.id,
            last_seen_at: new Date().toISOString(),
            // Only set sync_status to pending for new sets or failed ones
            sync_status: existingSet?.sync_status === 'synced' ? 'synced' : 'pending'
          }

          const { error: upsertError } = await supabase
            .from('catalog_v2.sets')
            .upsert(setData)

          if (upsertError) {
            console.error(`Failed to upsert set ${set.id}:`, upsertError)
            continue
          }

          if (!existingSet) {
            newSets++
          } else {
            updatedSets++
          }

          processedCount++

          // Update progress every 10 sets
          if (processedCount % 10 === 0) {
            await supabase
              .from('catalog_v2.sync_jobs')
              .update({
                progress: { current: processedCount, total: totalSets }
              })
              .eq('id', jobId)
          }

        } catch (error) {
          console.error(`Error processing set ${set.id}:`, error)
          continue
        }
      }

      hasMore = sets.length === limit && processedCount < totalSets
      offset += limit

      if (!hasMore) {
        console.log('Reached end of sets pagination')
      }
    }

    // Mark job as completed
    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: processedCount, total: totalSets },
        metadata: {
          newSets,
          updatedSets,
          totalProcessed: processedCount,
          game: game
        }
      })
      .eq('id', jobId)

    console.log(`Sets sync completed - New: ${newSets}, Updated: ${updatedSets}, Total: ${processedCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        newSets,
        updatedSets,
        totalProcessed: processedCount,
        game
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sets sync error:', error)

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