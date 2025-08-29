import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configuration from environment variables
const API_TIMEOUT = parseInt(Deno.env.get('JUSTTCG_API_TIMEOUT') || '30000')
const MAX_RETRIES = parseInt(Deno.env.get('JUSTTCG_MAX_RETRIES') || '3')
const BATCH_SIZE = parseInt(Deno.env.get('JUSTTCG_CARDS_BATCH_SIZE') || '25')
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

interface JustTCGVariant {
  id: string
  printing: string
  condition: string
  price: number
  currency: string
  language?: string
}

interface JustTCGCard {
  id: string
  name: string
  number?: string
  rarity?: string
  supertype?: string
  subtypes?: string[]
  tcgplayer_id?: string
  variants: JustTCGVariant[]
}

interface JustTCGResponse {
  data: JustTCGCard[]
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
    const { game, setId, forceResync = false } = await req.json()

    if (!game || !setId) {
      throw new Error('Game and setId parameters are required')
    }

    const startTime = Date.now()
    
    console.log(`Starting cards sync for game: ${game}, set: ${setId}, forceResync: ${forceResync}`)

    // Enhanced duplicate prevention logic
    if (!forceResync) {
      const { data: existingSet } = await supabase
        .from('catalog_v2.sets')
        .select('sync_status, card_count, justtcg_set_id')
        .eq('provider', 'justtcg')
        .eq('set_id', setId)
        .eq('game', game)
        .single()

      if (existingSet?.sync_status === 'synced') {
        // Check if set has new cards by comparing API count vs our count
        try {
          const justTcgGame = GAME_TO_JUSTTCG[game] || game
          const apiCheckUrl = `https://api.justtcg.com/v1/cards?game=${justTcgGame}&set=${setId}&limit=1&offset=0`
          
          const checkResponse = await fetchWithRetry(apiCheckUrl, {
            headers: {
              'x-api-key': justTcgApiKey,
              'Content-Type': 'application/json'
            }
          })
          
          if (checkResponse.ok) {
            const checkData = await checkResponse.json()
            const apiCardCount = checkData.total || 0
            const ourCardCount = existingSet.card_count || 0
            
            if (apiCardCount === ourCardCount) {
              console.log(`Set ${setId} already synced with matching card count (${ourCardCount}), skipping`)
              return new Response(
                JSON.stringify({
                  success: true,
                  skipped: true,
                  message: `Set already synced with ${ourCardCount} cards`,
                  setId,
                  card_count: ourCardCount
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            } else {
              console.log(`Set ${setId} has new cards: API=${apiCardCount}, DB=${ourCardCount}. Proceeding with sync.`)
            }
          }
        } catch (checkError) {
          console.log(`Could not verify card count, proceeding with sync: ${checkError.message}`)
        }
      }
    }

    const justTcgGame = GAME_TO_JUSTTCG[game] || game

    // Update set status to 'partial' while syncing
    await supabase
      .from('catalog_v2.sets')
      .update({ sync_status: 'partial' })
      .eq('provider', 'justtcg')
      .eq('set_id', setId)
      .eq('game', game)

    // Clean up orphaned running jobs for this set
    await supabase
      .from('catalog_v2.sync_jobs')
      .update({ 
        status: 'failed', 
        error_message: 'Job cleanup - was left in running state',
        completed_at: new Date().toISOString()
      })
      .eq('job_type', 'cards')
      .eq('game_slug', game)
      .eq('set_id', setId)
      .eq('status', 'running')

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('catalog_v2.sync_jobs')
      .insert({
        job_type: 'cards',
        game_slug: game,
        set_id: setId,
        status: 'running',
        started_at: new Date().toISOString(),
        progress: { current: 0, total: 0 },
        metadata: {
          start_time: startTime,
          api_calls: 0,
          performance: {},
          last_processed_offset: 0,
          batch_size: BATCH_SIZE
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
    let totalCards = 0
    let processedCount = 0
    let newCards = 0
    let updatedCards = 0
    let newVariants = 0
    let hasMore = true
    let apiCallCount = 0

    while (hasMore) {
      const url = `https://api.justtcg.com/v1/cards?game=${justTcgGame}&set=${setId}&limit=${limit}&offset=${offset}`
      console.log(`Fetching cards: ${url}`)

      const apiStartTime = Date.now()
      const response = await fetchWithRetry(url, {
        headers: {
          'x-api-key': justTcgApiKey,
          'Content-Type': 'application/json'
        }
      })

      const apiDuration = Date.now() - apiStartTime
      apiCallCount++
      console.log(`API call ${apiCallCount} took ${apiDuration}ms`)

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
      const cards = responseData.data || []

      if (offset === 0) {
        totalCards = responseData.total || cards.length
        const initialMetadata = {
          start_time: startTime,
          api_calls: apiCallCount,
          api_duration_ms: apiDuration,
          performance: {
            first_fetch_ms: apiDuration
          },
          last_processed_offset: 0,
          batch_size: BATCH_SIZE
        }
        
        await supabase
          .from('catalog_v2.sync_jobs')
          .update({
            progress: { current: 0, total: totalCards },
            metadata: initialMetadata
          })
          .eq('id', jobId)
        console.log(`Total cards to process: ${totalCards}`)
      }

      // Process cards in smaller batches for better memory management
      for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        const cardBatch = cards.slice(i, i + BATCH_SIZE)
        const batchStartTime = Date.now()
        
        console.log(`Processing batch of ${cardBatch.length} cards (${processedCount + i + 1}-${processedCount + i + cardBatch.length})`)

        // Process batch with transaction-like behavior
        try {
          for (const card of cardBatch) {
            try {
              // Check if card exists
              const { data: existingCard } = await supabase
                .from('catalog_v2.cards')
                .select('id')
                .eq('provider', 'justtcg')
                .eq('card_id', card.id)
                .single()

              // Parse tcgplayer_id from string to integer
              const tcgplayerId = card.tcgplayer_id ? parseInt(card.tcgplayer_id) : null

              const cardData = {
                provider: 'justtcg',
                card_id: card.id,
                game,
                set_id: setId,
                name: card.name,
                number: card.number || null,
                rarity: card.rarity || null,
                supertype: card.supertype || null,
                subtypes: card.subtypes || null,
                justtcg_id: card.id,
                tcgplayer_id: tcgplayerId,
                last_seen_at: new Date().toISOString()
              }

              const { error: cardError } = await supabase
                .from('catalog_v2.cards')
                .upsert(cardData)

              if (cardError) {
                console.error(`Failed to upsert card ${card.id}:`, cardError)
                continue
              }

              if (!existingCard) {
                newCards++
              } else {
                updatedCards++
              }

              // Process variants
              for (const variant of card.variants) {
                try {
                  const variantData = {
                    provider: 'justtcg',
                    variant_key: `${card.id}-${variant.printing}-${variant.condition}`,
                    card_id: card.id,
                    game,
                    language: variant.language || null,
                    printing: variant.printing,
                    condition: variant.condition,
                    price: variant.price ? Math.round(variant.price * 100) : null, // Convert to cents
                    currency: variant.currency || 'USD',
                    justtcg_variant_id: variant.id,
                    last_updated: new Date().toISOString(),
                    last_seen_at: new Date().toISOString()
                  }

                  const { data: existingVariant } = await supabase
                    .from('catalog_v2.variants')
                    .select('id')
                    .eq('provider', 'justtcg')
                    .eq('variant_key', variantData.variant_key)
                    .single()

                  const { error: variantError } = await supabase
                    .from('catalog_v2.variants')
                    .upsert(variantData)

                  if (variantError) {
                    console.error(`Failed to upsert variant ${variant.id}:`, variantError)
                    continue
                  }

                  if (!existingVariant) {
                    newVariants++
                  }

                } catch (variantError) {
                  console.error(`Error processing variant ${variant.id}:`, variantError)
                  continue
                }
              }

            } catch (error) {
              console.error(`Error processing card ${card.id}:`, error)
              continue
            }
          }

          const batchDuration = Date.now() - batchStartTime
          processedCount += cardBatch.length

          // Update progress with performance metrics
          const currentMetadata = {
            start_time: startTime,
            api_calls: apiCallCount,
            last_processed_offset: offset + i + cardBatch.length,
            processing_rate: processedCount / ((Date.now() - startTime) / 1000),
            batch_duration_ms: batchDuration,
            cards_per_second: cardBatch.length / (batchDuration / 1000),
            memory_usage: (Deno.memoryUsage?.() as any)?.heapUsed || 'unknown'
          }

          // Update progress every PROGRESS_UPDATE_INTERVAL items or after each batch
          if (processedCount % PROGRESS_UPDATE_INTERVAL === 0 || i + BATCH_SIZE >= cards.length) {
            await supabase
              .from('catalog_v2.sync_jobs')
              .update({
                progress: { current: processedCount, total: totalCards },
                metadata: currentMetadata
              })
              .eq('id', jobId)
          }

          // Memory cleanup hint between batches
          if (globalThis.gc) {
            globalThis.gc()
          }

          // Small delay between batches to prevent overwhelming the database
          if (i + BATCH_SIZE < cards.length) {
            await delay(100)
          }

        } catch (batchError) {
          console.error(`Error processing batch:`, batchError)
          continue
        }
      }

      hasMore = cards.length === limit && processedCount < totalCards
      offset += limit

      if (!hasMore) {
        console.log('Reached end of cards pagination')
      }
    }

    // Update set status to 'synced' and set card count
    await supabase
      .from('catalog_v2.sets')
      .update({
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        card_count: processedCount
      })
      .eq('provider', 'justtcg')
      .eq('set_id', setId)
      .eq('game', game)

    // Mark job as completed with comprehensive metrics
    const totalTime = Date.now() - startTime
    const finalMetadata = {
      start_time: startTime,
      end_time: Date.now(),
      total_duration_ms: totalTime,
      api_calls: apiCallCount,
      processing_rate: processedCount / (totalTime / 1000),
      cards_per_second: processedCount / (totalTime / 1000),
      newCards,
      updatedCards,
      newVariants,
      totalProcessed: processedCount,
      game,
      setId,
      batch_size: BATCH_SIZE,
      memory_peak: (Deno.memoryUsage?.() as any)?.heapUsed || 'unknown'
    }

    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: processedCount, total: totalCards },
        metadata: finalMetadata
      })
      .eq('id', jobId)

    console.log(`Cards sync completed - New cards: ${newCards}, Updated cards: ${updatedCards}, New variants: ${newVariants} in ${totalTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        newCards,
        updatedCards,
        newVariants,
        totalProcessed: processedCount,
        game,
        setId,
        duration_ms: totalTime,
        processing_rate: processedCount / (totalTime / 1000)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Cards sync error:', error)

    // Categorize error types
    let errorCategory = 'unknown'
    let errorMessage = error.message
    let suggestions = ''
    let syncStatus = 'failed'
    let setStatus = 'failed'

    if (error.message.includes('Rate limit')) {
      errorCategory = 'rate_limit'
      suggestions = 'Wait for rate limit to reset and try again'
      setStatus = 'pending' // Allow retry
    } else if (error.message.includes('API error')) {
      errorCategory = 'api_error' 
      suggestions = 'Check API key and JustTCG service status'
    } else if (error.message.includes('Network')) {
      errorCategory = 'network_error'
      suggestions = 'Check internet connection and try again'
      setStatus = 'pending' // Allow retry
    } else if (error.message.includes('Failed to create sync job')) {
      errorCategory = 'database_error'
      suggestions = 'Check database connection and permissions'
    } else if (processedCount > 0) {
      syncStatus = 'partial'
      setStatus = 'partial'
      suggestions = 'Some cards were processed. Use resume functionality to continue.'
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
            last_successful_offset: offset,
            can_resume: syncStatus === 'partial'
          }
        })
        .eq('id', jobId)
    }

    // Update set status appropriately
    const { setId, game } = await req.json().catch(() => ({}))
    if (setId && game) {
      await supabase
        .from('catalog_v2.sets')
        .update({ 
          sync_status: setStatus,
          card_count: processedCount > 0 ? processedCount : 0
        })
        .eq('provider', 'justtcg')
        .eq('set_id', setId)
        .eq('game', game)
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