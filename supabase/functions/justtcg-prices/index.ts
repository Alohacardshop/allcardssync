import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JTCG = "https://api.justtcg.com/v1";
const JHDRS: HeadersInit = { "X-API-Key": Deno.env.get("JUSTTCG_API_KEY")! };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- helpers ---
async function backoffWait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJsonWithRetry(url: string, options: RequestInit = {}, tries = 6, baseDelayMs = 500) {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          // Use rate-limit headers if available
          const retryAfter = res.headers.get('retry-after');
          const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : baseDelayMs * (2 ** i);
          await backoffWait(delayMs);
          continue;
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(() => '')}`);
      }
      return await res.json();
    } catch (e) {
      last = e;
      await backoffWait(baseDelayMs * (2 ** i));
    }
  }
  throw last || new Error(`retry_exhausted ${url}`);
}

// Single card price lookup
async function getSingleCardPrice(tcgplayerId: string, printing?: string, condition?: string) {
  const params = new URLSearchParams();
  params.set('tcgplayerId', tcgplayerId);
  
  if (printing) params.set('printing', printing);
  if (condition) params.set('condition', condition);

  const url = `${JTCG}/cards?${params.toString()}`;
  const response = await fetchJsonWithRetry(url, { 
    method: 'GET', 
    headers: JHDRS 
  });

  return response?.data || [];
}

// Batch card price lookup
async function getBatchCardPrices(requests: Array<{
  tcgplayerId: string;
  printing?: string;
  condition?: string;
  language?: string;
}>) {
  // Limit to 100 per request as per JustTCG docs
  const batches = [];
  for (let i = 0; i < requests.length; i += 100) {
    batches.push(requests.slice(i, i + 100));
  }

  const allResults = [];
  for (const batch of batches) {
    const response = await fetchJsonWithRetry(`${JTCG}/cards`, {
      method: 'POST',
      headers: {
        ...JHDRS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batch)
    });

    const data = response?.data || [];
    allResults.push(...data);
  }

  return allResults;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    if (req.method === 'GET') {
      // Single card lookup
      const tcgplayerId = url.searchParams.get('tcgplayerId');
      const printing = url.searchParams.get('printing') || undefined;
      const condition = url.searchParams.get('condition') || undefined;

      if (!tcgplayerId) {
        return new Response(JSON.stringify({ 
          error: 'Missing required parameter: tcgplayerId' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await getSingleCardPrice(tcgplayerId, printing, condition);
      
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (req.method === 'POST') {
      // Batch card lookup
      const body = await req.json();
      
      if (!Array.isArray(body)) {
        return new Response(JSON.stringify({ 
          error: 'Request body must be an array of card requests' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Validate each request object
      for (const item of body) {
        if (!item.tcgplayerId) {
          return new Response(JSON.stringify({ 
            error: 'Each request must have a tcgplayerId field' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const data = await getBatchCardPrices(body);
      
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      return new Response(JSON.stringify({ 
        error: 'Method not allowed. Use GET for single card or POST for batch.' 
      }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (e: any) {
    console.error("justtcg-prices error:", e);
    return new Response(JSON.stringify({ 
      error: e?.message || "Internal server error",
      stack: e?.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});