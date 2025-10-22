import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory cache
const CACHE = new Map<string, { ts: number; body: any }>();
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Rate limiting: 3 requests per second
let tokens = 3;
setInterval(() => { 
  tokens = Math.min(tokens + 3, 9); 
}, 1000);

async function throttledFetch(url: string) {
  const start = Date.now();
  while (tokens <= 0) {
    await new Promise(r => setTimeout(r, 50));
    if (Date.now() - start > 5000) {
      throw new Error('Rate limit timeout');
    }
  }
  tokens -= 1;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "AlohaCardShop/1.0 (admin@alohacardshop.com)"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCD ${res.status}: ${text}`);
  }

  return res.json();
}

function getCached(url: string) {
  const hit = CACHE.get(url);
  if (hit && (Date.now() - hit.ts) < TTL_MS) {
    return hit.body;
  }
  return null;
}

function setCached(url: string, body: any) {
  CACHE.set(url, { ts: Date.now(), body });
}

function computeHasNext(gcdJson: any, page: number) {
  const totalPages = gcdJson?.page_count ?? gcdJson?.num_pages ?? null;
  if (typeof totalPages === "number") {
    return page < totalPages;
  }
  const list = Array.isArray(gcdJson?.results) ? gcdJson.results : (Array.isArray(gcdJson) ? gcdJson : []);
  return list.length > 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { path, params } = await req.json();

    // Series search
    if (path === '/series') {
      const q = params?.q?.trim() || '';
      const page = Number(params?.page || 1);

      if (!q) {
        return new Response(
          JSON.stringify({ error: 'Missing query parameter: q' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const gcdUrl = `https://www.comics.org/series/name/${encodeURIComponent(q)}/sort/alpha/?_export=json&page=${page}`;
      console.log('Fetching series from:', gcdUrl);
      const cached = getCached(gcdUrl);
      const json = cached ?? await throttledFetch(gcdUrl);
      if (!cached) setCached(gcdUrl, json);

      console.log('GCD series response type:', typeof json);
      console.log('GCD series response is array:', Array.isArray(json));
      if (json && typeof json === 'object') {
        console.log('GCD series response keys:', Object.keys(json).slice(0, 20));
        console.log('GCD series sample (first 500 chars):', JSON.stringify(json).substring(0, 500));
      }

      // GCD HTML export with _export=json returns HTML table data as JSON objects
      // Format: Array of objects with keys matching HTML table columns
      let seriesList = [];
      if (Array.isArray(json)) {
        seriesList = json;
      } else if (json.results) {
        seriesList = json.results;
      } else if (json.objects) {
        seriesList = json.objects;
      }
      
      console.log('Series list length:', seriesList.length);
      if (seriesList.length > 0) {
        console.log('First series keys:', Object.keys(seriesList[0]));
        console.log('First series:', JSON.stringify(seriesList[0]));
      }
      
      const items = seriesList.map((r: any) => {
        // Try all possible field names
        const id = r.id || r.series_id || r.seriesid || r['Series ID'] || r.pk || 0;
        const name = r.name || r.series_name || r['Series Name'] || r.title || r['Title'] || "";
        
        console.log('Mapping item - raw:', JSON.stringify(r).substring(0, 200));
        console.log('Extracted - id:', id, 'name:', name);
        
        return {
          id: Number(id),
          name: String(name),
          year_began: Number(r.year_began || r['Year Began'] || r.start_year || r.year || 0) || undefined,
          publisher: r.publisher || r['Publisher'] || r.publisher_name || r.publisher?.name || "",
          url: r.url || r.resource_url || r.site_url || "",
          issue_count: r.issue_count || r['Issue Count'] || r.count_of_issues
        };
      });

      console.log('Mapped items count:', items.length, 'First item:', items[0]);

      return new Response(
        JSON.stringify({
          items,
          page,
          hasNext: computeHasNext(json, page),
          source: "GCD",
          license: "CC BY-SA 4.0"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Publishers search
    if (path === '/publishers') {
      const q = params?.q?.trim() || '';
      const page = Number(params?.page || 1);

      if (!q) {
        return new Response(
          JSON.stringify({ error: 'Missing query parameter: q' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const gcdUrl = `https://www.comics.org/publisher/name/${encodeURIComponent(q)}/sort/chrono/?_export=json&page=${page}`;
      const cached = getCached(gcdUrl);
      const json = cached ?? await throttledFetch(gcdUrl);
      if (!cached) setCached(gcdUrl, json);

      const items = (json.results ?? json ?? []).map((r: any) => ({
        id: Number(r.id ?? r.publisher_id ?? r.pk ?? 0),
        name: r.name ?? r.publisher_name ?? "",
        country: r.country ?? r.country_name,
        url: r.url ?? r.resource_url ?? ""
      }));

      return new Response(
        JSON.stringify({
          items,
          page,
          hasNext: computeHasNext(json, page),
          source: "GCD",
          license: "CC BY-SA 4.0"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Series issues
    const issuesMatch = path.match(/^\/series\/(\d+)\/issues$/);
    if (issuesMatch) {
      const seriesId = Number(issuesMatch[1]);
      const page = Number(params?.page || 1);

      if (!seriesId) {
        return new Response(
          JSON.stringify({ error: 'Invalid seriesId' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const gcdUrl = `https://www.comics.org/series/${seriesId}/?_export=json&page=${page}`;
      console.log('Fetching issues from:', gcdUrl);
      const cached = getCached(gcdUrl);
      const json = cached ?? await throttledFetch(gcdUrl);
      if (!cached) setCached(gcdUrl, json);

      console.log('GCD response keys:', Object.keys(json));
      console.log('GCD response sample:', JSON.stringify(json).substring(0, 500));

      // GCD returns issues directly in the response, not nested
      let issuesList = [];
      if (Array.isArray(json)) {
        issuesList = json;
      } else if (json.issues && Array.isArray(json.issues)) {
        issuesList = json.issues;
      } else if (json.results && Array.isArray(json.results)) {
        issuesList = json.results;
      }

      console.log('Found', issuesList.length, 'issues');

      const items = issuesList.map((r: any) => ({
        id: Number(r.id ?? r.issue_id ?? r.pk ?? 0),
        number: String(r.number ?? r.issue_number ?? ""),
        title: r.title ?? r.name ?? "",
        cover_date: r.cover_date ?? r.key_date ?? undefined,
        cover_id: r.cover?.id ?? r.cover_id ?? null,
        has_cover: !!(r.cover?.id ?? r.cover_id),
        url: r.url ?? r.resource_url ?? ""
      }));

      console.log('Processed items:', items.length, 'first item:', items[0]);

      return new Response(
        JSON.stringify({
          items,
          page,
          hasNext: computeHasNext(json, page),
          source: "GCD",
          license: "CC BY-SA 4.0"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('GCD search error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
