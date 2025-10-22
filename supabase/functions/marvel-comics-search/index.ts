import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHash } from "https://deno.land/std@0.190.0/hash/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MARVEL_PUBLIC_KEY = "cf0544fcf9106e1affbd03c8a1b1ce93";
const MARVEL_BASE_URL = "https://gateway.marvel.com/v1/public";

// Simple in-memory cache with 12-hour TTL
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

function generateAuthParams(): { ts: string; apikey: string; hash: string } {
  const privateKey = Deno.env.get("MARVEL_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("MARVEL_PRIVATE_KEY not configured");
  }

  const ts = Date.now().toString();
  const hash = createHash("md5")
    .update(ts + privateKey + MARVEL_PUBLIC_KEY)
    .toString("hex");

  return { ts, apikey: MARVEL_PUBLIC_KEY, hash };
}

function getCached(key: string): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, title, comicId, limit = 20, offset = 0 } = await req.json();

    if (action === "search") {
      if (!title) {
        return new Response(JSON.stringify({ error: "Title is required" }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check cache
      const cacheKey = `search:${title}:${limit}:${offset}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify({ ...cached, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const auth = generateAuthParams();
      const url = new URL(`${MARVEL_BASE_URL}/comics`);
      url.searchParams.set("title", title);
      url.searchParams.set("limit", limit.toString());
      url.searchParams.set("offset", offset.toString());
      url.searchParams.set("orderBy", "-onsaleDate");
      url.searchParams.set("ts", auth.ts);
      url.searchParams.set("apikey", auth.apikey);
      url.searchParams.set("hash", auth.hash);

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Marvel API error:", response.status, errorText);
        return new Response(JSON.stringify({ error: `Marvel API error: ${response.status}` }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      
      const result = {
        comics: data.data.results,
        total: data.data.total,
        count: data.data.count,
        attribution: "Data provided by Marvel. © 2025 MARVEL"
      };

      setCache(cacheKey, result);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "getComic") {
      if (!comicId) {
        return new Response(JSON.stringify({ error: "Comic ID is required" }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check cache
      const cacheKey = `comic:${comicId}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify({ ...cached, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const auth = generateAuthParams();
      const url = new URL(`${MARVEL_BASE_URL}/comics/${comicId}`);
      url.searchParams.set("ts", auth.ts);
      url.searchParams.set("apikey", auth.apikey);
      url.searchParams.set("hash", auth.hash);

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Marvel API error:", response.status, errorText);
        return new Response(JSON.stringify({ error: `Marvel API error: ${response.status}` }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      
      const result = {
        comic: data.data.results[0],
        attribution: "Data provided by Marvel. © 2025 MARVEL"
      };

      setCache(cacheKey, result);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Error in marvel-comics-search:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
