import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const FUNCTIONS_BASE = (Deno.env.get("SUPABASE_FUNCTIONS_URL") ||
  Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")).replace(/\/+$/, "");

// Structured logging helper
function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any> = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  console.log(JSON.stringify(logEntry));
}

// Drain queue with concurrency control
async function drainQueueConcurrent(mode: string, options: {
  maxConcurrency?: number;
  maxBatches?: number;
  batchSize?: number;
  timebudgetMs?: number;
} = {}) {
  const {
    maxConcurrency = 3,
    maxBatches = 10,
    batchSize = 5,
    timebudgetMs = 45000 // 45 seconds
  } = options;

  const startTime = Date.now();
  let totalProcessed = 0;
  let totalErrors = 0;
  let batchesProcessed = 0;

  logStructured('INFO', 'Starting turbo queue drain', {
    operation: 'turbo_drain',
    mode,
    maxConcurrency,
    maxBatches,
    batchSize,
    timebudgetMs
  });

  while (batchesProcessed < maxBatches && (Date.now() - startTime) < timebudgetMs) {
    const batchStart = Date.now();
    
    // Get queue stats first
    const { data: queueStats } = await supabaseClient
      .rpc('catalog_v2_queue_stats_by_mode', { mode_in: mode });
    
    if (!queueStats || queueStats.length === 0 || queueStats[0].queued === 0) {
      logStructured('INFO', 'Queue is empty, stopping drain', {
        operation: 'turbo_drain',
        mode,
        batchesProcessed,
        totalProcessed
      });
      break;
    }

    const queuedItems = queueStats[0].queued;
    const actualBatchSize = Math.min(batchSize, queuedItems);
    
    // Create concurrent promises for this batch
    const promises: Promise<any>[] = [];
    
    for (let i = 0; i < actualBatchSize && i < maxConcurrency; i++) {
      promises.push(
        fetch(`${FUNCTIONS_BASE}/catalog-sync/drain?mode=${encodeURIComponent(mode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`Drain failed: ${res.status} ${res.statusText}`);
          }
          return await res.json();
        })
        .catch(error => {
          logStructured('ERROR', 'Drain request failed', {
            operation: 'turbo_drain_item',
            mode,
            error: error.message
          });
          totalErrors++;
          return null;
        })
      );
    }

    // Wait for all concurrent requests to complete
    const results = await Promise.all(promises);
    const successfulResults = results.filter(r => r !== null);
    
    totalProcessed += successfulResults.length;
    batchesProcessed++;
    
    const batchDuration = Date.now() - batchStart;
    
    logStructured('INFO', 'Turbo batch completed', {
      operation: 'turbo_drain_batch',
      mode,
      batchNumber: batchesProcessed,
      batchSize: actualBatchSize,
      successful: successfulResults.length,
      errors: results.length - successfulResults.length,
      batchDurationMs: batchDuration,
      totalProcessed,
      totalErrors,
      remainingTimeMs: timebudgetMs - (Date.now() - startTime)
    });

    // Small delay between batches to avoid overwhelming the system
    if (batchesProcessed < maxBatches && (Date.now() - startTime) < timebudgetMs) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const totalDuration = Date.now() - startTime;
  
  logStructured('INFO', 'Turbo drain completed', {
    operation: 'turbo_drain_complete',
    mode,
    totalProcessed,
    totalErrors,
    batchesProcessed,
    totalDurationMs: totalDuration,
    avgBatchDurationMs: totalDuration / (batchesProcessed || 1)
  });

  return {
    totalProcessed,
    totalErrors,
    batchesProcessed,
    durationMs: totalDuration,
    status: totalErrors === 0 ? 'success' : 'partial_success'
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'pokemon';
    const maxConcurrency = parseInt(url.searchParams.get('concurrency') || '3');
    const maxBatches = parseInt(url.searchParams.get('batches') || '10');
    const batchSize = parseInt(url.searchParams.get('batchSize') || '5');
    
    logStructured('INFO', 'Turbo worker started', {
      operation: 'turbo_worker_start',
      mode,
      maxConcurrency,
      maxBatches,
      batchSize
    });

    // Start the background drain task
    const drainPromise = drainQueueConcurrent(mode, {
      maxConcurrency,
      maxBatches,
      batchSize
    });

    // Use EdgeRuntime.waitUntil to ensure the task completes even after we return response
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(drainPromise);
    }

    // Return immediate response
    return new Response(JSON.stringify({
      status: 'started',
      mode,
      message: 'Turbo background processing started',
      config: { maxConcurrency, maxBatches, batchSize }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    logStructured('ERROR', 'Turbo worker error', {
      operation: 'turbo_worker_error',
      error: error.message,
      stack: error.stack
    });

    return new Response(JSON.stringify({
      error: error.message,
      status: 'error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});