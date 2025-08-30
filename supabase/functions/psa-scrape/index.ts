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

interface PSAResponse {
  ok: boolean;
  source?: "firecrawl_structured" | "firecrawl_html";
  url: string;
  certNumber: string;
  grade?: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  cardNumber?: string;
  varietyPedigree?: string;
  imageUrl?: string | null;
  imageUrls: string[];
  diagnostics: {
    hadApiKey: boolean;
    firecrawlStatus: number | null;
    settingsMs: number;
    firecrawlMs: number;
    totalMs: number;
  };
  error?: string;
}

serve(async (req) => {
  const startTime = Date.now();
  
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
    return json200({ 
      ok: false, 
      error: 'Invalid JSON in request body',
      diagnostics: {
        hadApiKey: false,
        firecrawlStatus: null,
        settingsMs: 0,
        firecrawlMs: 0,
        totalMs: Date.now() - startTime
      }
    });
  }

  log.info('Request body parsed', { body });

  // Validate cert parameter
  const cert = String(body?.cert ?? "").trim();
  if (!/^\d{5,}$/.test(cert)) {
    log.error('Missing or invalid cert parameter', { cert });
    return json200({ 
      ok: false, 
      error: 'Missing or invalid cert parameter',
      diagnostics: {
        hadApiKey: false,
        firecrawlStatus: null,
        settingsMs: 0,
        firecrawlMs: 0,
        totalMs: Date.now() - startTime
      }
    });
  }

  log.info('Processing PSA certificate', { cert });

  const url = `https://www.psacard.com/cert/${cert}/psa`;

  // Get Firecrawl API key - try env first, then system setting
  const settingsStart = Date.now();
  let apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  
  if (!apiKey) {
    log.info('Getting Firecrawl API key from system settings');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout for settings
      
      const firecrawlResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-system-setting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          keyName: 'FIRECRAWL_API_KEY',
          fallbackSecretName: 'FIRECRAWL_API_KEY'
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (firecrawlResponse.ok) {
        const firecrawlData = await firecrawlResponse.json();
        apiKey = firecrawlData.value;
        log.info('Firecrawl API key retrieved from system settings');
      }
    } catch (error) {
      log.error('Error fetching Firecrawl API key', { error: error.message });
    }
  }

  const settingsMs = Date.now() - settingsStart;

  if (!apiKey) {
    log.error('FIRECRAWL_API_KEY not configured');
    return json200({ 
      ok: false, 
      error: 'FIRECRAWL_API_KEY not configured',
      diagnostics: {
        hadApiKey: false,
        firecrawlStatus: null,
        settingsMs,
        firecrawlMs: 0,
        totalMs: Date.now() - startTime
      }
    });
  }

  // Scrape PSA page with Firecrawl - with timeout
  log.info('Calling Firecrawl to scrape PSA page', { url });
  
  const firecrawlStart = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000); // 18s timeout for Firecrawl

  const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${apiKey}` 
    },
    body: JSON.stringify({ 
      url, 
      formats: ["extract", "html"], 
      timeout: 18000,
      waitFor: 2000 
    }),
    signal: controller.signal
  }).catch((e) => ({ 
    ok: false, 
    status: 0, 
    json: async () => ({ error: String(e) }) 
  } as any));

  clearTimeout(timeout);
  const firecrawlMs = Date.now() - firecrawlStart;

  const firecrawlStatus = fcResp.status ?? 0;

  if (!fcResp.ok) {
    log.error('Firecrawl API error', { status: firecrawlStatus, url });
    return json200({ 
      ok: false, 
      error: `Firecrawl request failed (${firecrawlStatus})`,
      url,
      certNumber: cert,
      diagnostics: {
        hadApiKey: true,
        firecrawlStatus,
        settingsMs,
        firecrawlMs,
        totalMs: Date.now() - startTime
      }
    });
  }

  const fcJson: any = await fcResp.json().catch(() => ({}));
  const data = fcJson?.data ?? fcJson ?? {};
  
  // Try structured extract first, then fallback to HTML
  const extract = data.extract || {};
  const html = data.html || data.content || "";
  const markdown = data.markdown || "";

  log.info('Firecrawl response received', { 
    hasExtract: !!Object.keys(extract).length,
    hasHtml: !!html, 
    hasMarkdown: !!markdown,
    htmlLength: html.length,
    markdownLength: markdown.length
  });

  let source: "firecrawl_structured" | "firecrawl_html";
  let norm: any;

  // Try structured extraction first
  if (extract && Object.keys(extract).length > 0) {
    source = "firecrawl_structured";
    norm = {
      certNumber: cert,
      grade: extract.grade || extract.itemGrade,
      year: extract.year,
      brandTitle: extract.brandTitle || extract.brand,
      subject: extract.subject || extract.cardName,
      cardNumber: extract.cardNumber,
      varietyPedigree: extract.varietyPedigree || extract.variety,
    };
  } else if (html || markdown) {
    // Fallback to HTML parsing
    source = "firecrawl_html";
    const text = (html || markdown).replace(/\s+/g, " ").trim();

    function pick(re: RegExp) {
      const m = text.match(re);
      return m ? m[1].trim() : null;
    }

    norm = {
      certNumber: cert,
      grade: pick(/Item Grade[:\s]*([A-Z0-9\s.+-]+)/i),
      year: pick(/Year[:\s]*([0-9]{4})/i),
      brandTitle: pick(/Brand\/Title[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
      subject: pick(/Subject[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
      cardNumber: pick(/Card Number[:\s]*([A-Z0-9\-]+)\b/i),
      varietyPedigree: pick(/Variety\/Pedigree[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
    };
  } else {
    log.error('No extract/html/markdown returned from Firecrawl');
    return json200({ 
      ok: false, 
      error: "No data returned from Firecrawl",
      url,
      certNumber: cert,
      diagnostics: {
        hadApiKey: true,
        firecrawlStatus,
        settingsMs,
        firecrawlMs,
        totalMs: Date.now() - startTime
      }
    });
  }

  // Extract images
  const imgs: string[] = [];
  if (html) {
    for (const m of (html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi) || [])) {
      const u = m.match(/src=['"]([^'"]+)['"]/i)?.[1];
      if (u && !imgs.includes(u)) imgs.push(u);
    }
    // og:image
    const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i)?.[1];
    if (og && !imgs.includes(og)) imgs.unshift(og);
  }

  const totalMs = Date.now() - startTime;

  log.info('PSA data extracted', { 
    cert, 
    source,
    extractedFields: Object.keys(norm).filter(k => norm[k]),
    imageCount: imgs.length,
    totalMs
  });

  return json200({
    ok: true,
    source,
    url,
    ...norm,
    imageUrl: imgs[0] ?? null,
    imageUrls: imgs,
    diagnostics: {
      hadApiKey: true,
      firecrawlStatus,
      settingsMs,
      firecrawlMs,
      totalMs
    }
  });
});
