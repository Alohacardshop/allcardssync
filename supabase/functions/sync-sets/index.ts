import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configuration from environment variables
const API_TIMEOUT = parseInt(Deno.env.get('JUSTTCG_API_TIMEOUT') || '30000')
const MAX_RETRIES = parseInt(Deno.env.get('JUSTTCG_MAX_RETRIES') || '3')
const BATCH_SIZE = parseInt(Deno.env.get('JUSTTCG_SETS_BATCH_SIZE') || '25')
const PROGRESS_UPDATE_INTERVAL = parseInt(Deno.env.get('PROGRESS_UPDATE_INTERVAL') || '10')

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

    const startTime = Date.now()
    const justTcgGame = GAME_TO_JUSTTCG[game] || game

    console.log(`Starting sets sync for game: ${game} (JustTCG: ${justTcgGame})`)

    // Clean up orphaned running jobs for this game
    await supabase
      .from('catalog_v2.sync_jobs')
      .update({ 
        status: 'failed', 
        error_message: 'Job cleanup - was left in running state',
        completed_at: new Date().toISOString()
      })
      .eq('job_type', 'sets')
      .eq('game_slug', game)
      .eq('status', 'running')

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('catalog_v2.sync_jobs')
      .insert({
        job_type: 'sets',
        game_slug: game,
        status: 'running',
        started_at: new Date().toISOString(),
        progress: { current: 0, total: 0 },
        metadata: {
          start_time: startTime,
          api_calls: 0,
          performance: {},
          last_processed_offset: 0
        }
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

      const apiStartTime = Date.now()
      const response = await fetchWithRetry(url, {
        headers: {
          'x-api-key': justTcgApiKey,
          'Content-Type': 'application/json'
        }
      })

      const apiDuration = Date.now() - apiStartTime
      console.log(`API call took ${apiDuration}ms`)

      // Log rate limit headers if present
      const rateLimit = response.headers.get('x-ratelimit-remaining')
      if (rateLimit) {
        console.log(`API Rate limit remaining: ${rateLimit}`)
      }

      if (!response.ok) {
        throw new Error(`JustTCG API error: ${response.status} ${response.statusText}`)
      }

      // Rate limiting - add delay between API calls
      await delay(1000)

      const responseData = await response.json() as JustTCGResponse
      const sets = responseData.data || []

      if (offset === 0) {
        totalSets = responseData.total || sets.length
        const initialMetadata = {
          start_time: startTime,
          api_calls: 1,
          api_duration_ms: apiDuration,
          performance: {
            first_fetch_ms: apiDuration
          },
          last_processed_offset: 0
        }
        
        await supabase
          .from('catalog_v2.sync_jobs')
          .update({
            progress: { current: 0, total: totalSets },
            metadata: initialMetadata
          })
          .eq('id', jobId)
        console.log(`Total sets to process: ${totalSets}`)
      }

      // Process sets in batches
      const batchedSets = []
      for (let i = 0; i < sets.length; i += BATCH_SIZE) {
        batchedSets.push(sets.slice(i, i + BATCH_SIZE))
      }

      for (const batch of batchedSets) {
        const batchStartTime = Date.now()
        
        try {
          // Process each set in the batch
          for (const set of batch) {
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

            } catch (error) {
              console.error(`Error processing set ${set.id}:`, error)
              continue
            }
          }

          const batchDuration = Date.now() - batchStartTime
          
          // Update progress with performance metrics
          const currentMetadata = {
            start_time: startTime,
            api_calls: Math.ceil((offset + sets.length) / limit),
            last_processed_offset: offset + sets.length,
            processing_rate: processedCount / ((Date.now() - startTime) / 1000),
            batch_duration_ms: batchDuration,
            memory_usage: (Deno.memoryUsage?.() as any)?.heapUsed || 'unknown'
          }

          // Update progress every batch or every PROGRESS_UPDATE_INTERVAL items
          if (processedCount % PROGRESS_UPDATE_INTERVAL === 0 || processedCount % BATCH_SIZE === 0) {
            await supabase
              .from('catalog_v2.sync_jobs')
              .update({
                progress: { current: processedCount, total: totalSets },
                metadata: currentMetadata
              })
              .eq('id', jobId)
          }

          // Memory cleanup hint between batches
          if (globalThis.gc) {
            globalThis.gc()
          }

        } catch (batchError) {
          console.error(`Error processing batch:`, batchError)
          continue
        }
      }

      hasMore = sets.length === limit && processedCount < totalSets
      offset += limit

      if (!hasMore) {
        console.log('Reached end of sets pagination')
      }
    }

    // Mark job as completed with comprehensive metrics
    const totalTime = Date.now() - startTime
    const finalMetadata = {
      start_time: startTime,
      end_time: Date.now(),
      total_duration_ms: totalTime,
      api_calls: Math.ceil(totalSets / limit),
      processing_rate: processedCount / (totalTime / 1000),
      newSets,
      updatedSets,
      totalProcessed: processedCount,
      game: game,
      memory_peak: (Deno.memoryUsage?.() as any)?.heapUsed || 'unknown'
    }

    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: processedCount, total: totalSets },
        metadata: finalMetadata
      })
      .eq('id', jobId)

    console.log(`Sets sync completed - New: ${newSets}, Updated: ${updatedSets}, Total: ${processedCount} in ${totalTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        newSets,
        updatedSets,
        totalProcessed: processedCount,
        game,
        duration_ms: totalTime,
        processing_rate: processedCount / (totalTime / 1000)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sets sync error:', error)

    // Categorize error types
    let errorCategory = 'unknown'
    let errorMessage = error.message
    let suggestions = ''
    let syncStatus = 'failed'

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
    } else if (processedCount > 0) {
      syncStatus = 'partial'
      suggestions = 'Some sets were processed. Use resume functionality to continue.'
    }

    // Update job status to failed with detailed error info
    if (jobId) {
      await supabase
        .from('catalog_v2.sync_jobs')
        .update({
          status: syncStatus,
          completed_at: new Date().toISOString(),
          error_message: `${errorCategory}: ${errorMessage}`,
          metadata: {
            error_category: errorCategory,
            error_suggestions: suggestions,
            failed_at: Date.now(),
            processed_before_failure: processedCount,
            can_resume: syncStatus === 'partial'
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
        processed: processedCount,
        can_resume: syncStatus === 'partial',
        jobId
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})