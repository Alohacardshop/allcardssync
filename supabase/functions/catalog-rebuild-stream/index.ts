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
  set_id?: string
  set_name?: string
  data?: any
  error?: string
  rolled_back?: number
  not_found?: number
  total_sets?: number
  completed_sets?: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const requestedGames = body.games || ['pokemon', 'pokemon-japan', 'mtg']
    const sequentialMode = body.mode === 'sequential' || body.sequential === true
    
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

            // Helper to retry HTTP calls with exponential backoff
            const retryFetch = async (url: string, options: any, retries = 3) => {
              for (let i = 0; i < retries; i++) {
                try {
                  const response = await fetch(url, options)
                  if (response.ok || response.status < 500) return response
                  throw new Error(`HTTP ${response.status}`)
                } catch (error) {
                  if (i === retries - 1) throw error
                  await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
                }
              }
            }

            // Clear shadow tables using RPC
            const clearShadowTables = async (game: string) => {
              const { error } = await supabase.rpc('catalog_v2_clear_shadow_for_game', { game_in: game })
              if (error) throw new Error(`Failed to clear shadow tables: ${error.message}`)
            }

            // Fetch sets data from provider APIs and upsert to shadow tables
            const fetchAndUpsertSets = async (game: string) => {
              if (game === 'pokemon') {
                const { data, error } = await supabase.functions.invoke('catalog-sync-pokemon')
                if (error) throw new Error(`Pokemon sets sync failed: ${error.message}`)
                return data
              } else if (game === 'pokemon-japan') {
                const { data, error } = await supabase.functions.invoke('catalog-sync-pokemon', {
                  body: { region: 'japan' }
                })
                if (error) throw new Error(`Pokemon Japan sets sync failed: ${error.message}`)
                return data
              } else if (game === 'mtg') {
                const { data, error } = await supabase.functions.invoke('catalog-sync-justtcg', {
                  body: { game: 'magic-the-gathering' }
                })
                if (error) throw new Error(`MTG sets sync failed: ${error.message}`)
                return data
              }
              throw new Error(`Unsupported game: ${game}`)
            }

            // Fetch cards for a specific set
            const fetchSetCards = async (game: string, setId: string, setName: string) => {
              const maxRetries = 3
              for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                  if (game === 'pokemon') {
                    const { data, error } = await supabase.functions.invoke('catalog-sync-pokemon', {
                      body: { setId }
                    })
                    if (error) throw error
                    return data
                  } else if (game === 'pokemon-japan') {
                    const { data, error } = await supabase.functions.invoke('catalog-sync-pokemon', {
                      body: { setId, region: 'japan' }
                    })
                    if (error) throw error
                    return data
                  } else if (game === 'mtg') {
                    const { data, error } = await supabase.functions.invoke('catalog-sync-justtcg', {
                      body: { game: 'magic-the-gathering', set: setName }
                    })
                    if (error) throw error
                    return data
                  }
                } catch (error: any) {
                  if (attempt === maxRetries - 1) {
                    throw new Error(`Failed to fetch ${game} set ${setId} after ${maxRetries} attempts: ${error.message}`)
                  }
                  await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
                }
              }
            }


            const mode = sequentialMode ? "sequential" : "parallel"
            sendLog({ 
              type: "START", 
              message: `Starting catalog rebuild (${mode} mode)`, 
              data: { games: requestedGames, mode } 
            })

            for (const game of requestedGames) {
              try {
                sendLog({ type: "START_GAME", game, message: `🎯 Starting ${game}` })

                // Step 1: Clear shadow tables using RPC
                sendLog({ type: "IMPORT_PHASE", game, step: "CLEAR_SHADOW", message: "Clearing shadow tables" })
                await clearShadowTables(game)

                // Step 2: Fetch and upsert sets
                sendLog({ type: "IMPORT_PHASE", game, step: "SETS", message: "Importing sets" })
                await fetchAndUpsertSets(game)

                // Step 3: Process cards - sequential mode does one set at a time
                if (sequentialMode) {
                  // Get pending sets from shadow tables
                  const { data: pendingSets, error: setsError } = await supabase.rpc('catalog_v2_get_pending_sets_for_game', { 
                    game_in: game 
                  })
                  if (setsError) throw new Error(`Failed to get pending sets: ${setsError.message}`)

                  const totalSets = pendingSets?.length || 0
                  sendLog({ 
                    type: "IMPORT_PHASE", 
                    game, 
                    step: "CARDS_START", 
                    message: `Processing ${totalSets} sets sequentially`,
                    total_sets: totalSets 
                  })

                  for (let i = 0; i < totalSets; i++) {
                    const set = pendingSets[i]
                    try {
                      sendLog({ 
                        type: "IMPORT_SET_START", 
                        game, 
                        set_id: set.provider_id,
                        set_name: set.name,
                        message: `📦 Set ${i + 1}/${totalSets}: ${set.name}`,
                        completed_sets: i,
                        total_sets: totalSets
                      })

                      await fetchSetCards(game, set.provider_id, set.name)

                      sendLog({ 
                        type: "IMPORT_SET_DONE", 
                        game, 
                        set_id: set.provider_id,
                        set_name: set.name,
                        message: `✅ Set ${i + 1}/${totalSets}: ${set.name} complete`,
                        completed_sets: i + 1,
                        total_sets: totalSets
                      })
                    } catch (setError: any) {
                      sendLog({ 
                        type: "ERROR", 
                        game, 
                        set_id: set.provider_id,
                        error: setError.message,
                        message: `❌ Set ${set.name} failed: ${setError.message}` 
                      })
                      // Continue with next set
                    }
                  }
                } else {
                  // Parallel mode - bulk sync all cards at once
                  sendLog({ type: "IMPORT_PHASE", game, step: "CARDS_BULK", message: "Bulk importing all cards" })
                  await fetchAndUpsertSets(game) // This should trigger card sync too
                }

                // Step 4: Validate data integrity
                sendLog({ type: "VALIDATE", game, message: "Validating data integrity" })
                const { data: nullCount, error: validationError } = await supabase.rpc('catalog_v2_sets_new_null_provider_count', { 
                  game_in: game 
                })
                if (validationError) throw new Error(`Validation failed: ${validationError.message}`)
                
                if ((nullCount || 0) > 0) {
                  sendLog({ 
                    type: "ERROR", 
                    game, 
                    error: "VALIDATION_FAILED",
                    message: `❌ Validation failed: ${nullCount} sets with null provider_id` 
                  })
                  continue
                }
                sendLog({ type: "VALIDATE", game, message: "✅ Validation passed" })

                // Step 5: Atomic swap using existing RPC
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
                  message: "🎉 Atomic swap completed successfully" 
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