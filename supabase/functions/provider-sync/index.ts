import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getJustTCGApiKey, 
  pageSets, 
  pageCards, 
  pageVariants, 
  normalizeName,
  fetchGames,
  type GameSlug,
  type SetDTO,
  type CardDTO,
  type VariantDTO
} from "../_shared/providers/justtcg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RequestBody = { 
  provider: "justtcg"; 
  games: GameSlug[] | "ALL";
  mode?: "live" | "shadow";  // default to "live" for direct catalog updates
};

const enc = new TextEncoder();
const sse = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const body = await req.json().catch(() => ({})) as RequestBody;
    let { provider, games, mode = "live" } = body;

    if (provider !== "justtcg") {
      return new Response("Bad Request: provider must be 'justtcg'", { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Handle "ALL" games mode
    if (games === "ALL") {
      const apiKey = await getJustTCGApiKey();
      const allGames = await fetchGames(apiKey);
      games = allGames.filter(g => g.active !== false).map(g => g.id as GameSlug);
    }

    if (!games?.length) {
      return new Response("Bad Request: games array required or no active games found", { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const apiKey = await getJustTCGApiKey();

    const stream = new ReadableStream({
      async start(controller) {
        const push = (event: Record<string, unknown>) => {
          controller.enqueue(enc.encode(sse({ 
            ...event, 
            timestamp: new Date().toISOString() 
          })));
        };

        try {
          push({ 
            type: "START", 
            provider, 
            games, 
            mode,
            message: `Starting ${provider} sync for ${games.length} games`
          });

          for (const game of games) {
            push({ 
              type: "START_GAME", 
              game, 
              message: `🎯 Starting ${game} sync` 
            });

            // ---- PHASE 1: Sets ----
            push({ 
              type: "PHASE_START", 
              game, 
              phase: "sets", 
              message: "📦 Syncing sets" 
            });

            let totalSets = 0;
            const apiSetsForGuardrail: any[] = [];

            for await (const { items, cursor } of pageSets(apiKey, game)) {
              // Map to simplified schema - only the fields that exist
              const rows = items.map((s: SetDTO) => ({
                provider: provider,
                set_id: `${provider}-${s.id}`,
                provider_id: s.id,
                game: game,
                name: s.name,
                code: s.code || null
              }));

              // Use existing simplified RPC for batch upsert
              const { error } = await sb.rpc('catalog_v2_upsert_sets', { rows });
              if (error) throw new Error(`Failed to upsert sets: ${error.message}`);

              // Save API sets for guardrail
              apiSetsForGuardrail.push(...items.map(s => ({
                provider_id: s.id,
                name: s.name
              })));

              await saveCursor(sb, provider, game, "sets", cursor);
              totalSets += rows.length;

              push({ 
                type: "UPSERT_SETS", 
                game, 
                count: rows.length, 
                total: totalSets,
                cursor,
                message: `📦 Imported ${rows.length} sets (total: ${totalSets})`
              });
            }

            // Run guardrail pass on live sets (exact-only matching)
            push({ 
              type: "GUARDRAIL", 
              game, 
              message: "🛡️ Running guardrails on sets" 
            });

            try {
              let rolledBack = 0;
              let notFound = 0;

              // Check for name mismatches and null provider_id if normalized names differ
              for (const apiSet of apiSetsForGuardrail) {
                const { data: dbSets } = await sb
                  .from('catalog_v2.sets')
                  .select('name, provider_id')
                  .eq('game', game)
                  .eq('provider_id', apiSet.provider_id)
                  .maybeSingle();

                if (dbSets) {
                  const dbNameNorm = normalizeName(dbSets.name);
                  const apiNameNorm = normalizeName(apiSet.name);
                  
                  if (dbNameNorm !== apiNameNorm) {
                    // Null provider_id for mismatched names (exact-only guardrail)
                    await sb
                      .from('catalog_v2.sets')
                      .update({ provider_id: null })
                      .eq('game', game)
                      .eq('provider_id', apiSet.provider_id);
                    rolledBack++;
                  }
                } else {
                  notFound++;
                }
              }

              push({ 
                type: "GUARDRAIL_RESULT", 
                game, 
                rolled_back: rolledBack, 
                not_found: notFound,
                message: `🛡️ Guardrail: ${rolledBack} mismatched names nulled, ${notFound} API sets not found in DB`
              });
            } catch (guardrailError: any) {
              push({ 
                type: "WARNING", 
                game, 
                message: `⚠️ Guardrail check failed: ${guardrailError.message}` 
              });
            }

            // ---- PHASE 2: Cards (per set) ----
            push({ 
              type: "PHASE_START", 
              game, 
              phase: "cards", 
              message: "🃏 Syncing cards" 
            });

            const setProviderIds = await getAllSetProviderIds(sb, game);
            let totalCards = 0;

            for (const setId of setProviderIds) {
              let setCards = 0;
              for await (const { items, cursor } of pageCards(apiKey, game, setId)) {
                // Map to simplified schema - only the fields that exist
                const rows = items.map((c: CardDTO) => ({
                  provider: provider,
                  card_id: `${provider}-${c.id}`,
                  provider_id: c.id,
                  game: game,
                  set_provider_id: c.setId,
                  name: c.name,
                  number: c.number || null
                }));

                const { error } = await sb.rpc('catalog_v2_upsert_cards', { rows });
                if (error) throw new Error(`Failed to upsert cards: ${error.message}`);

                await saveCursor(sb, provider, game, `cards:${setId}`, cursor);
                setCards += rows.length;
                totalCards += rows.length;
              }

              if (setCards > 0) {
                push({ 
                  type: "UPSERT_CARDS", 
                  game, 
                  set: setId, 
                  count: setCards, 
                  total: totalCards,
                  message: `🃏 Set ${setId}: ${setCards} cards (game total: ${totalCards})`
                });
              }
            }

            // ---- PHASE 3: Variants (per card) ----
            push({ 
              type: "PHASE_START", 
              game, 
              phase: "variants", 
              message: "💎 Syncing variants" 
            });

            const cardProviderIds = await getAllCardProviderIds(sb, game);
            let totalVariants = 0;

            for (const cardId of cardProviderIds) {
              let cardVariants = 0;
              for await (const { items, cursor } of pageVariants(apiKey, game, cardId)) {
                // Map to simplified schema - only the fields that exist
                const rows = items.map((v: VariantDTO) => ({
                  provider: provider,
                  variant_id: v.id ? `${provider}-${v.id}` : null,
                  provider_id: v.id || null,
                  card_id: `${provider}-${v.cardId}`,
                  game: game,
                  sku: v.sku || null
                }));

                const { error } = await sb.rpc('catalog_v2_upsert_variants', { rows });
                if (error) throw new Error(`Failed to upsert variants: ${error.message}`);

                await saveCursor(sb, provider, game, `variants:${cardId}`, cursor);
                cardVariants += rows.length;
                totalVariants += rows.length;
              }

              if (cardVariants > 0 && totalVariants % 1000 === 0) {
                push({ 
                  type: "UPSERT_VARIANTS_PROGRESS", 
                  game, 
                  total: totalVariants,
                  message: `💎 Progress: ${totalVariants} variants synced`
                });
              }
            }

            if (totalVariants > 0) {
              push({ 
                type: "UPSERT_VARIANTS", 
                game, 
                count: totalVariants,
                message: `💎 Total variants synced: ${totalVariants}`
              });
            }

            push({ 
              type: "GAME_DONE", 
              game, 
              sets: totalSets,
              cards: totalCards,
              variants: totalVariants,
              message: `✅ ${game} complete: ${totalSets} sets, ${totalCards} cards, ${totalVariants} variants`
            });
          }

          push({ 
            type: "COMPLETE", 
            message: "🎉 Provider sync completed successfully" 
          });
          controller.close();
        } catch (error: any) {
          push({ 
            type: "ERROR", 
            error: error?.message || String(error),
            message: `❌ Sync failed: ${error?.message || String(error)}`
          });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive"
      }
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || String(error) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// ----- Database helpers -----

async function saveCursor(sb: any, provider: string, game: string, entity: string, cursor: Record<string, unknown>) {
  const { error } = await sb.from("catalog_v2.provider_sync_state").upsert({
    provider, 
    game, 
    entity, 
    cursor_json: cursor, 
    updated_at: new Date().toISOString()
  }, { onConflict: "provider,game,entity" });
  
  if (error) throw new Error(`Failed to save cursor: ${error.message}`);
}

async function getAllSetProviderIds(sb: any, game: string): Promise<string[]> {
  const { data, error } = await sb
    .from("catalog_v2.sets")
    .select("provider_id")
    .eq("game", game)
    .not("provider_id", "is", null);
    
  if (error) throw new Error(`Failed to get set provider IDs: ${error.message}`);
  return (data ?? []).map((r: any) => r.provider_id).filter(Boolean);
}

async function getAllCardProviderIds(sb: any, game: string): Promise<string[]> {
  const { data, error } = await sb
    .from("catalog_v2.cards")
    .select("card_id")
    .eq("game", game)
    .not("card_id", "is", null);
    
  if (error) throw new Error(`Failed to get card provider IDs: ${error.message}`);
  
  // Extract provider ID from card_id (format: "provider-providerid")
  return (data ?? [])
    .map((r: any) => r.card_id?.split('-').slice(1).join('-'))
    .filter(Boolean);
}