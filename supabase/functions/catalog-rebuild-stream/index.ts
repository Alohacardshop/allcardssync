import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_GAME_SLUGS = ['pokemon', 'pokemon-japan', 'mtg']

interface LogMessage {
  type: string
  timestamp: string
  level?: 'info' | 'success' | 'error' | 'warning'
  message?: string
  game?: string
  step?: string
  data?: any
  error?: string
  rolled_back?: number
  not_found?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const requestedGames = body.games || ['pokemon', 'pokemon-japan', 'mtg']
    
    // Validate game slugs
    const invalidGames = requestedGames.filter((game: string) => !VALID_GAME_SLUGS.includes(game))
    if (invalidGames.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid game slugs: ${invalidGames.join(', ')}. Valid options: ${VALID_GAME_SLUGS.join(', ')}`
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Set up Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        const sendLog = (log: LogMessage) => {
          const data = `data: ${JSON.stringify({
            ...log,
            timestamp: log.timestamp || new Date().toISOString()
          })}\n\n`
          controller.enqueue(new TextEncoder().encode(data))
        }

        const processRebuild = async () => {
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            // Helper to normalize names for exact matching
            const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

            // Clear shadow tables for selected games
            const clearShadowTables = async (game: string) => {
              await supabase.from('catalog_v2.variants_new').delete().eq('game', game)
              await supabase.from('catalog_v2.cards_new').delete().eq('game', game) 
              await supabase.from('catalog_v2.sets_new').delete().eq('game', game)
            }

            // Fetch provider data using existing sync functions
            const fetchProviderData = async (game: string) => {
              if (game === 'pokemon') {
                // Call Pokemon TCG sync for full catalog
                const { data, error } = await supabase.functions.invoke('catalog-sync-pokemon', {
                  body: { fullSync: true }
                })
                if (error) throw new Error(`Pokemon sync failed: ${error.message}`)
                return data
              } else {
                // Call JustTCG sync for MTG and Pokemon Japan
                const gameParam = game === 'pokemon-japan' ? 'pokemon-japan' : 'magic-the-gathering'
                const { data, error } = await supabase.functions.invoke('catalog-sync-justtcg', {
                  body: { game: gameParam, fullSync: true }
                })
                if (error) throw new Error(`JustTCG sync failed: ${error.message}`)
                return data
              }
            }

            // Upsert data to shadow tables using existing RPCs
            const upsertToShadow = async (game: string, syncResult: any) => {
              // The sync functions already populate the main tables, but for rebuild
              // we need to use shadow tables. We'll fetch the data and re-insert to shadow.
              
              // Get sets for this game from main tables (just updated by sync)
              const { data: sets } = await supabase
                .from('catalog_v2.sets')
                .select('*')
                .eq('game', game)

              if (sets?.length) {
                const setRows = sets.map(s => ({
                  provider: s.provider,
                  set_id: s.set_id,
                  provider_id: s.provider_id,
                  game: s.game,
                  name: s.name,
                  series: s.series,
                  printed_total: s.printed_total,
                  total: s.total,
                  release_date: s.release_date,
                  images: s.images,
                  data: s.data
                }))
                
                await supabase.rpc('catalog_v2_upsert_sets_new', { rows: setRows })
              }

              // Get cards for this game
              const { data: cards } = await supabase
                .from('catalog_v2.cards')
                .select('*')
                .eq('game', game)

              if (cards?.length) {
                // Process in chunks to avoid memory issues
                const chunkSize = 500
                for (let i = 0; i < cards.length; i += chunkSize) {
                  const chunk = cards.slice(i, i + chunkSize)
                  const cardRows = chunk.map(c => ({
                    provider: c.provider,
                    card_id: c.card_id,
                    game: c.game,
                    set_id: c.set_id,
                    name: c.name,
                    number: c.number,
                    rarity: c.rarity,
                    supertype: c.supertype,
                    subtypes: c.subtypes,
                    images: c.images,
                    tcgplayer_product_id: c.tcgplayer_product_id,
                    tcgplayer_url: c.tcgplayer_url,
                    data: c.data
                  }))
                  
                  await supabase.rpc('catalog_v2_upsert_cards_new', { rows: cardRows })
                }
              }

              // Get variants for this game  
              const { data: variants } = await supabase
                .from('catalog_v2.variants')
                .select('*')
                .eq('game', game)

              if (variants?.length) {
                const chunkSize = 500
                for (let i = 0; i < variants.length; i += chunkSize) {
                  const chunk = variants.slice(i, i + chunkSize)
                  const variantRows = chunk.map(v => ({
                    provider: v.provider,
                    variant_id: v.variant_id,
                    card_id: v.card_id,
                    game: v.game,
                    language: v.language,
                    printing: v.printing,
                    condition: v.condition,
                    sku: v.sku,
                    price: v.price,
                    market_price: v.market_price,
                    low_price: v.low_price,
                    mid_price: v.mid_price,
                    high_price: v.high_price,
                    currency: v.currency,
                    data: v.data
                  }))
                  
                  await supabase.rpc('catalog_v2_upsert_variants_new', { rows: variantRows })
                }
              }

              return {
                sets: sets?.length || 0,
                cards: cards?.length || 0, 
                variants: variants?.length || 0
              }
            }

            // Fix bad writes by checking for mismatched provider names
            const fixBadWrites = async (game: string) => {
              const { data: shadowSets } = await supabase
                .from('catalog_v2.sets_new')
                .select('set_id, name, provider_id')
                .eq('game', game)
                .not('provider_id', 'is', null)

              let rolled_back = 0
              let not_found = 0

              if (shadowSets?.length) {
                // Get current provider data to compare
                const { data: providerSets } = await supabase
                  .from('catalog_v2.sets')
                  .select('set_id, name, provider_id')
                  .eq('game', game)
                  .not('provider_id', 'is', null)

                const providerMap = new Map(providerSets?.map(s => [s.provider_id, s]) || [])

                for (const shadowSet of shadowSets) {
                  const providerSet = providerMap.get(shadowSet.provider_id)
                  
                  if (!providerSet) {
                    // Provider ID not found in current data
                    await supabase
                      .from('catalog_v2.sets_new')
                      .update({ provider_id: null })
                      .eq('set_id', shadowSet.set_id)
                    not_found++
                  } else if (normalizeName(providerSet.name) !== normalizeName(shadowSet.name)) {
                    // Name mismatch - clear provider ID
                    await supabase
                      .from('catalog_v2.sets_new')
                      .update({ provider_id: null })
                      .eq('set_id', shadowSet.set_id)
                    rolled_back++
                  }
                }
              }

              return { rolled_back, not_found }
            }

            // Validate that no sets have null provider_id in shadow tables
            const validateShadowData = async (game: string) => {
              const { count } = await supabase
                .from('catalog_v2.sets_new')
                .select('*', { count: 'exact', head: true })
                .eq('game', game)
                .is('provider_id', null)
              
              return (count || 0) === 0
            }

            sendLog({ type: "START", message: "Starting catalog rebuild", data: { games: requestedGames } })

            for (const game of requestedGames) {
              try {
                sendLog({ type: "START_GAME", game, message: `Starting rebuild for ${game}` })

                // Step 1: Clear shadow tables
                sendLog({ type: "IMPORT_PHASE", game, step: "CLEAR_SHADOW", message: "Clearing shadow tables" })
                await clearShadowTables(game)

                // Step 2: Fetch fresh data from provider using existing sync functions
                sendLog({ type: "IMPORT_PHASE", game, step: "FETCH_PROVIDER", message: "Fetching data from provider" })
                const syncResult = await fetchProviderData(game)

                // Step 3: Copy fresh data to shadow tables
                sendLog({ type: "IMPORT_PHASE", game, step: "UPSERT_SHADOW", message: "Upserting to shadow tables" })
                const counts = await upsertToShadow(game, syncResult)
                sendLog({ 
                  type: "IMPORT_PHASE", 
                  game, 
                  step: "UPSERT_COMPLETE", 
                  message: "Shadow upsert complete",
                  data: counts 
                })

                // Step 4: Fix bad writes (guardrails)
                sendLog({ type: "FIX_BAD_WRITES", game, message: "Running guardrails" })
                const { rolled_back, not_found } = await fixBadWrites(game)
                sendLog({ 
                  type: "FIX_BAD_WRITES_SUMMARY", 
                  game, 
                  rolled_back, 
                  not_found,
                  message: `Fixed ${rolled_back} bad writes, ${not_found} not found` 
                })

                // Step 5: Validate data integrity
                sendLog({ type: "VALIDATE", game, message: "Validating data integrity" })
                const isValid = await validateShadowData(game)
                if (!isValid) {
                  sendLog({ 
                    type: "ERROR", 
                    game, 
                    error: "VALIDATION_FAILED",
                    message: "Data validation failed - skipping swap" 
                  })
                  continue
                }
                sendLog({ type: "VALIDATE", game, message: "✅ Validation passed" })

                // Step 6: Atomic swap using existing RPC
                sendLog({ type: "READY_TO_SWAP", game, message: "Ready for atomic swap" })
                const { error: swapError } = await supabase.rpc('atomic_catalog_swap', { 
                  game_name: game 
                })
                if (swapError) {
                  throw new Error(`Atomic swap failed: ${swapError.message}`)
                }
                
                sendLog({ 
                  type: "SWAP_DONE", 
                  game, 
                  message: "✅ Atomic swap completed successfully" 
                })

              } catch (gameError: any) {
                sendLog({ 
                  type: "ERROR", 
                  game, 
                  error: gameError.message,
                  message: `❌ ${game} rebuild failed: ${gameError.message}` 
                })
              }
            }

            sendLog({ 
              type: "COMPLETE", 
              message: "🎉 Catalog rebuild process completed" 
            })

          } catch (error: any) {
            sendLog({ 
              type: "ERROR", 
              error: error.message,
              message: `❌ Rebuild process failed: ${error.message}` 
            })
          } finally {
            controller.close()
          }
        }

        // Start the rebuild process
        processRebuild()
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})