import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { log } from "../_shared/log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper function for JSON responses with CORS
const json200 = (obj: unknown) =>
  new Response(JSON.stringify(obj), { 
    status: 200, 
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

interface NormalizedResult {
  ok: boolean;
  source: "scrape";
  url: string;
  certNumber: string;
  grade?: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  cardNumber?: string;
  varietyPedigree?: string;
  labelType?: string;
  categoryName?: string;
  imageUrl?: string | null;
  imageUrls: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  log.info('PSA scrape request received', { method: req.method });

  // Parse and validate request body
  let body: any = {};
  try {
    body = await req.json();
  } catch (error) {
    log.error('Invalid JSON in request body', { error: error.message });
    return json200({ ok: false, error: 'Invalid JSON in request body' });
  }

  log.info('Request body parsed', { body });

  // Validate cert parameter
  const cert = String(body?.cert ?? "").trim();
  if (!/^\d{5,}$/.test(cert)) {
    log.error('Missing or invalid cert parameter', { cert });
    return json200({ ok: false, error: 'Missing or invalid cert parameter' });
  }

  log.info('Processing PSA certificate', { cert });

  const url = `https://www.psacard.com/cert/${cert}/psa`;

  // Get Firecrawl API key - try env first, then system setting
  let apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  
  if (!apiKey) {
    log.info('Getting Firecrawl API key from system settings');
    try {
      const firecrawlResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-system-setting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          keyName: 'FIRECRAWL_API_KEY',
          fallbackSecretName: 'FIRECRAWL_API_KEY'
        })
      });

      if (firecrawlResponse.ok) {
        const firecrawlData = await firecrawlResponse.json();
        apiKey = firecrawlData.value;
        log.info('Firecrawl API key retrieved from system settings');
      }
    } catch (error) {
      log.error('Error fetching Firecrawl API key', { error: error.message });
    }
  }

  if (!apiKey) {
    log.error('FIRECRAWL_API_KEY not configured');
    return json200({ ok: false, error: 'FIRECRAWL_API_KEY not configured' });
  }

  // Scrape PSA page with Firecrawl
  log.info('Calling Firecrawl to scrape PSA page', { url });
  
  const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${apiKey}` 
    },
    body: JSON.stringify({ url, formats: ["html", "markdown"] }),
  }).catch((e) => ({ 
    ok: false, 
    status: 0, 
    json: async () => ({ error: String(e) }) 
  } as any));

  if (!fcResp.ok) {
    const status = fcResp.status ?? 0;
    log.error('Firecrawl API error', { status, url });
    return json200({ ok: false, error: `Firecrawl request failed (${status})` });
  }

  const fcJson: any = await fcResp.json().catch(() => ({}));
  const data = fcJson?.data ?? fcJson ?? {};
  const html = data.html || data.content || "";
  const markdown = data.markdown || "";

  log.info('Firecrawl response received', { 
    hasHtml: !!html, 
    hasMarkdown: !!markdown,
    htmlLength: html.length,
    markdownLength: markdown.length
  });

  if (!html && !markdown) {
    log.error('No html/markdown returned from Firecrawl');
    return json200({ ok: false, error: "No html/markdown returned from Firecrawl" });
  }

  // Simple extraction using the content
  const text = (html || markdown).replace(/\s+/g, " ").trim();

  function pick(re: RegExp) {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  }

  const norm = {
    certNumber: cert,
    grade: pick(/Item Grade[:\s]*([A-Z0-9\s.+-]+)/i),
    year: pick(/Year[:\s]*([0-9]{4})/i),
    brandTitle: pick(/Brand\/Title[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
    subject: pick(/Subject[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
    cardNumber: pick(/Card Number[:\s]*([A-Z0-9\-]+)\b/i),
    varietyPedigree: pick(/Variety\/Pedigree[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
  };

  // Extract images
  const imgs: string[] = [];
  for (const m of (html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi) || [])) {
    const u = m.match(/src=['"]([^'"]+)['"]/i)?.[1];
    if (u && !imgs.includes(u)) imgs.push(u);
  }
  // og:image
  const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i)?.[1];
  if (og && !imgs.includes(og)) imgs.unshift(og);

  log.info('PSA data extracted', { 
    cert, 
    extractedFields: Object.keys(norm).filter(k => norm[k]),
    imageCount: imgs.length
  });

  return json200({
    ok: true,
    source: "scrape",
    url,
    ...norm,
    imageUrl: imgs[0] ?? null,
    imageUrls: imgs,
  });
});
