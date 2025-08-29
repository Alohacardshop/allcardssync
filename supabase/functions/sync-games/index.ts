import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configuration from environment variables
const API_TIMEOUT = parseInt(Deno.env.get('JUSTTCG_API_TIMEOUT') || '30000')
const MAX_RETRIES = parseInt(Deno.env.get('JUSTTCG_MAX_RETRIES') || '3')

// Rate limiting and retry utilities
async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        if (attempt === retries) throw new Error('Rate limit exceeded after all retries')
        
        const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 30000)
        console.log(`Rate limited, waiting ${backoffMs}ms before retry ${attempt}`)
        await delay(backoffMs)
        continue
      }
      
      if (!response.ok && response.status >= 500 && attempt < retries) {
        console.log(`Server error ${response.status}, retrying attempt ${attempt}`)
        await delay(1000 * attempt)
        continue
      }
      
      return response
    } catch (error) {
      if (attempt === retries) throw error
      console.log(`Network error, retrying attempt ${attempt}:`, error.message)
      await delay(1000 * attempt)
    }
  }
  throw new Error('Max retries exceeded')
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
    const startTime = Date.now()
    
    // Clean up orphaned running jobs
    await supabase
      .from('catalog_v2.sync_jobs')
      .update({ 
        status: 'failed', 
        error_message: 'Job cleanup - was left in running state',
        completed_at: new Date().toISOString()
      })
      .eq('job_type', 'games')
      .eq('status', 'running')

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('catalog_v2.sync_jobs')
      .insert({
        job_type: 'games',
        status: 'running',
        started_at: new Date().toISOString(),
        progress: { current: 0, total: 0 },
        metadata: { 
          start_time: startTime,
          api_calls: 0,
          performance: {}
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('Failed to create sync job:', jobError)
      throw new Error('Failed to create sync job')
    }

    jobId = job.id

    console.log(`Starting games sync - Job ID: ${jobId}`)

    // Fetch games from JustTCG API with retry logic
    const apiStartTime = Date.now()
    const response = await fetchWithRetry('https://api.justtcg.com/v1/games', {
      headers: {
        'x-api-key': justTcgApiKey,
        'Content-Type': 'application/json'
      }
    })

    const apiDuration = Date.now() - apiStartTime
    console.log(`API call took ${apiDuration}ms`)

    if (!response.ok) {
      throw new Error(`JustTCG API error: ${response.status} ${response.statusText}`)
    }

    // Log rate limit headers if present
    const rateLimit = response.headers.get('x-ratelimit-remaining')
    if (rateLimit) {
      console.log(`API Rate limit remaining: ${rateLimit}`)
    }

    const gamesData = await response.json() as JustTCGGame[]
    console.log(`Fetched ${gamesData.length} games from JustTCG API`)

    // Update job with total count and performance data
    const currentMetadata = { 
      start_time: startTime,
      api_calls: 1,
      api_duration_ms: apiDuration,
      performance: {
        fetch_games_ms: apiDuration
      }
    }

    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        progress: { current: 0, total: gamesData.length },
        metadata: currentMetadata
      })
      .eq('id', jobId)

    let processedCount = 0
    const upsertedGames = []
    const dbStartTime = Date.now()

    // Process games in batches with transaction-like behavior
    const batchSize = 5 // Process games in smaller batches
    for (let i = 0; i < gamesData.length; i += batchSize) {
      const batch = gamesData.slice(i, i + batchSize)
      
      try {
        // Process batch
        for (const game of batch) {
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

          } catch (error) {
            console.error(`Error processing game ${game.id}:`, error)
            continue
          }
        }

        // Update progress after each batch
        const updatedMetadata = {
          ...currentMetadata,
          last_processed_offset: i + batch.length,
          processing_rate: processedCount / ((Date.now() - dbStartTime) / 1000),
          memory_usage: (Deno.memoryUsage?.() as any)?.heapUsed || 'unknown'
        }

        await supabase
          .from('catalog_v2.sync_jobs')
          .update({
            progress: { current: processedCount, total: gamesData.length },
            metadata: updatedMetadata
          })
          .eq('id', jobId)

        // Small delay between batches to prevent overwhelming the database
        if (i + batchSize < gamesData.length) {
          await delay(100)
        }

      } catch (batchError) {
        console.error(`Error processing batch starting at ${i}:`, batchError)
        continue
      }
    }

    // Mark job as completed with comprehensive metrics
    const totalTime = Date.now() - startTime
    const finalMetadata = {
      start_time: startTime,
      end_time: Date.now(),
      total_duration_ms: totalTime,
      api_calls: 1,
      api_duration_ms: apiDuration,
      db_duration_ms: Date.now() - dbStartTime,
      processing_rate: processedCount / (totalTime / 1000),
      processedGames: processedCount,
      totalGames: gamesData.length,
      upsertedCount: upsertedGames.length,
      memory_peak: (Deno.memoryUsage?.() as any)?.heapUsed || 'unknown'
    }

    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: processedCount, total: gamesData.length },
        metadata: finalMetadata
      })
      .eq('id', jobId)

    console.log(`Games sync completed - Processed: ${processedCount}/${gamesData.length} in ${totalTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        processed: processedCount,
        total: gamesData.length,
        upserted: upsertedGames.length,
        duration_ms: totalTime,
        processing_rate: processedCount / (totalTime / 1000)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Games sync error:', error)

    // Categorize error types
    let errorCategory = 'unknown'
    let errorMessage = error.message
    let suggestions = ''

    if (error.message.includes('Rate limit')) {
      errorCategory = 'rate_limit'
      suggestions = 'Wait for rate limit to reset and try again'
    } else if (error.message.includes('API error')) {
      errorCategory = 'api_error' 
      suggestions = 'Check API key and JustTCG service status'
    } else if (error.message.includes('Network')) {
      errorCategory = 'network_error'
      suggestions = 'Check internet connection and try again'
    } else if (error.message.includes('Failed to create sync job')) {
      errorCategory = 'database_error'
      suggestions = 'Check database connection and permissions'
    }

    // Update job status to failed with detailed error info
    if (jobId) {
      await supabase
        .from('catalog_v2.sync_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: `${errorCategory}: ${errorMessage}`,
          metadata: {
            error_category: errorCategory,
            error_suggestions: suggestions,
            failed_at: Date.now()
          }
        })
        .eq('id', jobId)
    }

    const status = errorCategory === 'rate_limit' ? 429 : 500

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        error_category: errorCategory,
        suggestions: suggestions,
        jobId
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})