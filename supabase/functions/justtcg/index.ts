// supabase/functions/justtcg/index.ts
// Deno Deploy / Supabase Edge Function
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Cache-Control": "public, max-age=120",
  "Content-Type": "application/json",
};

const TTL = 5 * 60 * 1000;
type CacheEntry = { t: number; data: unknown };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > TTL) { cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key: string, data: unknown) {
  cache.set(key, { t: Date.now(), data });
}

function keyFrom(req: Request, bodyText?: string) {
  const u = new URL(req.url);
  return `${req.method}:${u.pathname}?${u.searchParams.toString()}#${bodyText ?? ""}`;
}

async function getApiKey() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await supabase
    .from("system_settings")
    .select("key_value")
    .eq("key_name", "JUSTTCG_API_KEY")
    .maybeSingle();
  if (error) throw error;
  return data?.key_value as string | undefined;
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3) {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
      last = res;
      continue;
    }
    return res;
  }
  return last!;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  if (!url.pathname.endsWith("/justtcg") && !url.pathname.endsWith("/justtcg/cards")) {
    // Allow subpath /cards
  }

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "JUSTTCG_API_KEY not set" }), { status: 500, headers: cors });
    }

    // normalize to /cards route inside function
    const isCards = url.pathname.endsWith("/justtcg") || url.pathname.endsWith("/justtcg/") || url.pathname.endsWith("/justtcg/cards");
    if (!isCards) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: cors });

    if (req.method === "GET") {
      const cacheKey = keyFrom(req);
      const cached = cacheGet(cacheKey);
      if (cached) return new Response(JSON.stringify({ data: cached, fromCache: true }), { headers: cors });

      // Server-side safeguards
      const name = (url.searchParams.get('name') || '').trim();
      if (name && name.length < 3) {
        return new Response(JSON.stringify({ error: 'min_length' }), { status: 400, headers: cors });
      }
      const limit = Math.min(5, Math.max(1, Number(url.searchParams.get('limit') || 5)));
      url.searchParams.set('limit', String(limit));

      const qs = url.searchParams.toString();
      const upstream = `https://api.justtcg.com/v1/cards${qs ? `?${qs}` : ""}`;
      const res = await fetchWithRetry(upstream, {
        method: "GET",
        headers: { "x-api-key": apiKey }
      });
      const text = await res.text();
      if (!res.ok) return new Response(text || res.statusText, { status: res.status, headers: cors });
      const json = JSON.parse(text);
      cacheSet(cacheKey, json);
      return new Response(JSON.stringify({ data: json, fromCache: false }), { headers: cors });
    }

    if (req.method === "POST") {
      const bodyText = await req.text();
      const cacheKey = keyFrom(req, bodyText);
      const cached = cacheGet(cacheKey);
      if (cached) return new Response(JSON.stringify({ data: cached, fromCache: true }), { headers: cors });

      const res = await fetchWithRetry("https://api.justtcg.com/v1/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: bodyText || "[]"
      });
      const text = await res.text();
      if (!res.ok) return new Response(text || res.statusText, { status: res.status, headers: cors });
      const json = JSON.parse(text);
      cacheSet(cacheKey, json);
      return new Response(JSON.stringify({ data: json, fromCache: false }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), { status: 500, headers: cors });
  }
});