// JustTCG catalog sync with circuit breaker and structured logging
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CFG } from "../_lib/config.ts";
import { fetchJson } from "../_lib/http.ts";
import { canCall, report } from "../_lib/circuit.ts";
import { log, genRequestId, logToDb } from "../_lib/log.ts";
import { corsHeaders, getCorsHeaders } from "../_lib/cors.ts";
import { JustTcgSet, JustTcgCard } from "../_lib/schemas.ts";

const JUSTTCG_BASE = "https://api.justtcg.com/v2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = genRequestId();
  const origin = req.headers.get("origin");

  try {
    // Parse parameters
    const url = new URL(req.url);
    const game = url.searchParams.get("game") || "pokemon";
    const setName = url.searchParams.get("set");
    const mode = url.searchParams.get("mode") || "sync";

    log.info("catalog-sync-justtcg:start", { requestId, game, setName, mode });

    // Check circuit breaker
    if (!canCall("justtcg")) {
      log.warn("catalog-sync-justtcg:circuit-open", { requestId, service: "justtcg" });
      return new Response(
        JSON.stringify({ error: "service_unavailable", message: "JustTCG API is temporarily unavailable" }),
        { status: 503, headers: { ...getCorsHeaders(origin), "Content-Type": "application/json", "X-Request-Id": requestId } }
      );
    }

    if (!setName) {
      return new Response(
        JSON.stringify({ error: "missing_parameter", message: "Set name required" }),
        { status: 400, headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase
    const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_SERVICE_ROLE_KEY);

    // Log to database (async)
    logToDb(supabase, { requestId, level: "INFO", message: "catalog-sync-justtcg:start", context: { game, setName, mode } });

    // Get API key from secrets
    const apiKey = CFG.JUSTTCG_API_KEY;
    if (!apiKey) {
      log.error("catalog-sync-justtcg:no-api-key", { requestId });
      return new Response(
        JSON.stringify({ error: "configuration_error", message: "JustTCG API key not configured" }),
        { status: 500, headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    // Fetch set data from JustTCG
    try {
      const setsUrl = `${JUSTTCG_BASE}/${game}/sets?name=${encodeURIComponent(setName)}`;
      log.info("catalog-sync-justtcg:fetch-set", { requestId, url: setsUrl });

      const setsResponse = await fetchJson<{ data: any[] }>(
        setsUrl,
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        },
        { tries: 3, timeoutMs: 10000 }
      );

      if (!setsResponse.data || setsResponse.data.length === 0) {
        report("justtcg", false);
        log.warn("catalog-sync-justtcg:set-not-found", { requestId, setName });
        return new Response(
          JSON.stringify({ error: "not_found", message: "Set not found", setName }),
          { status: 404, headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" } }
        );
      }

      const set = JustTcgSet.parse(setsResponse.data[0]);
      report("justtcg", true);

      // Fetch cards for this set
      const cardsUrl = `${JUSTTCG_BASE}/${game}/cards?set=${set.id}`;
      log.info("catalog-sync-justtcg:fetch-cards", { requestId, setId: set.id, url: cardsUrl });

      const cardsResponse = await fetchJson<{ data: any[] }>(
        cardsUrl,
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        },
        { tries: 3, timeoutMs: 15000 }
      );

      report("justtcg", true);

      // Use batch upsert RPC for better performance
      const cardsPayload = (cardsResponse.data || []).map((card: any) => ({
        game,
        set_id: set.id,
        card_id: card.id,
        name: card.name,
        number: card.number,
        provider_id: card.id,
        rarity: card.rarity,
        supertype: card.supertype,
        subtypes: card.subtypes?.join(","),
        images: JSON.stringify(card.images || {}),
        data: JSON.stringify(card)
      }));

      if (cardsPayload.length > 0) {
        const { data: batchResult, error: batchError } = await supabase
          .rpc("catalog_v2.batch_upsert_cards_variants", {
            payload: { cards: cardsPayload, variants: [] }
          });

        if (batchError) {
          log.error("catalog-sync-justtcg:batch-upsert-failed", { requestId, error: batchError.message });
        } else {
          log.info("catalog-sync-justtcg:batch-complete", { requestId, result: batchResult });
        }
      }

      const result = {
        success: true,
        requestId,
        set: {
          id: set.id,
          name: set.name,
          series: set.series
        },
        cardsProcessed: cardsResponse.data?.length || 0
      };

      log.info("catalog-sync-justtcg:complete", { requestId, ...result });
      logToDb(supabase, { requestId, level: "INFO", message: "catalog-sync-justtcg:complete", context: result });

      return new Response(
        JSON.stringify(result),
        { 
          status: 200, 
          headers: { 
            ...getCorsHeaders(origin), 
            "Content-Type": "application/json",
            "X-Request-Id": requestId 
          } 
        }
      );

    } catch (apiError) {
      report("justtcg", false);
      log.error("catalog-sync-justtcg:api-error", { requestId, error: String(apiError) });
      
      return new Response(
        JSON.stringify({ 
          error: "api_error", 
          message: String(apiError),
          requestId 
        }),
        { status: 500, headers: { ...getCorsHeaders(origin), "Content-Type": "application/json", "X-Request-Id": requestId } }
      );
    }

  } catch (error) {
    log.error("catalog-sync-justtcg:error", { requestId, error: String(error) });
    
    return new Response(
      JSON.stringify({ 
        error: "internal_error", 
        message: String(error),
        requestId 
      }),
      { status: 500, headers: { ...getCorsHeaders(origin), "Content-Type": "application/json", "X-Request-Id": requestId } }
    );
  }
});
