import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log(`Starting cards sync for game: ${game}, set: ${setId}, forceResync: ${forceResync}`)

    // Check if set is already synced (unless forceResync is true)
    if (!forceResync) {
      const { data: existingSet } = await supabase
        .from('catalog_v2.sets')
        .select('sync_status')
        .eq('provider', 'justtcg')
        .eq('set_id', setId)
        .eq('game', game)
        .single()

      if (existingSet?.sync_status === 'synced') {
        console.log(`Set ${setId} already synced, skipping`)
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            message: 'Set already synced',
            setId
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
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

    // Create sync job
    const { data: job, error: jobError } = await supabase
      .from('catalog_v2.sync_jobs')
      .insert({
        job_type: 'cards',
        game_slug: game,
        set_id: setId,
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
    let totalCards = 0
    let processedCount = 0
    let newCards = 0
    let updatedCards = 0
    let newVariants = 0
    let hasMore = true
    const cardBatch = []

    while (hasMore) {
      const url = `https://api.justtcg.com/v1/cards?game=${justTcgGame}&set=${setId}&limit=${limit}&offset=${offset}`
      console.log(`Fetching cards: ${url}`)

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
      const cards = responseData.data || []

      if (offset === 0) {
        totalCards = responseData.total || cards.length
        await supabase
          .from('catalog_v2.sync_jobs')
          .update({
            progress: { current: 0, total: totalCards }
          })
          .eq('id', jobId)
        console.log(`Total cards to process: ${totalCards}`)
      }

      cardBatch.push(...cards)

      // Process in batches of 50 cards
      if (cardBatch.length >= 50 || (!hasMore && cardBatch.length > 0)) {
        console.log(`Processing batch of ${cardBatch.length} cards`)

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

            processedCount++

          } catch (error) {
            console.error(`Error processing card ${card.id}:`, error)
            continue
          }
        }

        // Update progress
        await supabase
          .from('catalog_v2.sync_jobs')
          .update({
            progress: { current: processedCount, total: totalCards }
          })
          .eq('id', jobId)

        cardBatch.length = 0 // Clear the batch
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

    // Mark job as completed
    await supabase
      .from('catalog_v2.sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: processedCount, total: totalCards },
        metadata: {
          newCards,
          updatedCards,
          newVariants,
          totalProcessed: processedCount,
          game,
          setId
        }
      })
      .eq('id', jobId)

    console.log(`Cards sync completed - New cards: ${newCards}, Updated cards: ${updatedCards}, New variants: ${newVariants}`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        newCards,
        updatedCards,
        newVariants,
        totalProcessed: processedCount,
        game,
        setId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Cards sync error:', error)

    // Update job status to failed and revert set status
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

    // Revert set status to 'failed'
    const { setId, game } = await req.json().catch(() => ({}))
    if (setId && game) {
      await supabase
        .from('catalog_v2.sets')
        .update({ sync_status: 'failed' })
        .eq('provider', 'justtcg')
        .eq('set_id', setId)
        .eq('game', game)
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