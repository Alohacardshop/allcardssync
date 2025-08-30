import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Firecrawl-only PSA scraper with strict CORS, OPTIONS handling, ping, and diagnostics.

const ORIGIN_WHITELIST = new Set<string>([
  "https://0d7146fe-d4a7-46e7-93f6-dd19713f6a25.sandbox.lovable.dev", // Lovable sandbox
  "http://localhost:5173",                                            // dev
  "http://localhost:3000",                                            // dev alt
  "https://app.alohacardshop.com"                                     // prod (adjust if different)
]);

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ORIGIN_WHITELIST.has(origin) ? origin : "";
  const h: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (allowed) h["Access-Control-Allow-Origin"] = allowed;
  return h;
}

const json200 = (req: Request, obj: unknown) =>
  new Response(JSON.stringify(obj), { status: 200, headers: corsHeadersFor(req) });

type FirecrawlResult = { data?: any; html?: string; markdown?: string; content?: string } | any;

interface PSACertificateData {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  cardNumber?: string;
  varietyPedigree?: string;
  category?: string;
  imageUrl?: string;
  imageUrls?: string[];
  psaUrl: string;
  rawHtml?: string;
  rawMarkdown?: string;
  firecrawlResponse?: any;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: Request) {
  const started = Date.now();
  
  console.log('🚀 PSA-SCRAPE-V2 FUNCTION STARTED');
  console.log('📝 Request method:', req.method);
  console.log('🌐 Request URL:', req.url);
  
  const hdrs = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    console.log('✅ OPTIONS request handled');
    return new Response("ok", { status: 200, headers: hdrs });
  }
  
  if (req.method !== "POST") {
    console.log('❌ Invalid method:', req.method);
    return new Response(JSON.stringify({ ok:false, error:"Use POST" }), { status:200, headers:hdrs });
  }

  let body: any = {};
  try { 
    body = await req.json(); 
    console.log('📦 Request body parsed:', JSON.stringify(body));
  } catch (e) {
    console.log('❌ Failed to parse JSON body:', e);
  }

  // Lightweight reachability check
  if (body?.mode === "ping") {
    console.log('🏓 Ping request handled');
    return json200(req, { ok:true, message:"psa-scrape-v2 reachable", diagnostics:{ totalMs: Date.now()-started } });
  }

  const cert = String(body?.cert ?? "").trim();
  console.log('🔍 Certificate number extracted:', cert);
  
  if (!/^\d{8,9}$/.test(cert)) {
    console.log('❌ Invalid certificate format:', cert);
    return json200(req, { ok:false, error:"Invalid certificate number (must be 8-9 digits)" });
  }

  const psaUrl = `https://www.psacard.com/cert/${cert}/psa`;
  console.log('🌐 PSA URL constructed:', psaUrl);
  
  // Environment check
  console.log('🔧 Environment check:');
  console.log('- SUPABASE_URL exists:', !!Deno.env.get('SUPABASE_URL'));
  console.log('- SUPABASE_SERVICE_ROLE_KEY exists:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  console.log('- FIRECRAWL_API_KEY exists:', !!Deno.env.get('FIRECRAWL_API_KEY'));
  
  try {
    console.log('📊 Checking database for cached result...');
    // Check if we have a recent cached result (within 24 hours)
    const { data: existingCert, error: cacheError } = await supabase
      .from('psa_certificates')
      .select('*')
      .eq('cert_number', cert)
      .gte('scraped_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 24 hours ago
      .single();
    
    if (cacheError && cacheError.code !== 'PGRST116') {
      console.log('⚠️ Database cache check error:', cacheError);
    } else if (existingCert) {
      console.log('✅ Found cached result');
    } else {
      console.log('ℹ️ No cached result found, will scrape fresh');
    }

    if (existingCert) {
      console.log('💾 Returning cached result');
      return json200(req, {
        ok: true,
        source: "database_cache",
        url: psaUrl,
        certNumber: existingCert.cert_number,
        isValid: existingCert.is_valid,
        grade: existingCert.grade,
        year: existingCert.year,
        brandTitle: existingCert.brand,
        subject: existingCert.subject,
        cardNumber: existingCert.card_number,
        varietyPedigree: existingCert.variety_pedigree,
        category: existingCert.category,
        imageUrl: existingCert.image_url,
        imageUrls: existingCert.image_urls,
        diagnostics: {
          totalMs: Date.now() - started,
          cached: true,
          cacheAge: Date.now() - new Date(existingCert.scraped_at).getTime()
        }
      });
    }
  } catch (dbInitError) {
    console.log('💥 Database initialization error:', dbInitError);
    return json200(req, {
      ok: false,
      error: `Database error: ${dbInitError.message}`,
      diagnostics: { totalMs: Date.now() - started }
    });
  }

  // Firecrawl key (env first)
  console.log('🔑 Getting Firecrawl API key...');
  const tKey = Date.now();
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
  const settingsMs = Date.now() - tKey;
  
  if (!apiKey) {
    console.log('❌ FIRECRAWL_API_KEY not configured');
    return json200(req, {
      ok:false,
      error:"FIRECRAWL_API_KEY not configured",
      diagnostics:{ hadApiKey:false, settingsMs, totalMs: Date.now()-started }
    });
  }
  
  console.log('✅ Firecrawl API key found (length:', apiKey.length, ')');
  console.log('🔑 API key prefix:', apiKey.substring(0, 10) + '...');

  // Log the request
  const requestStart = Date.now();
  const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  // Firecrawl call
  console.log('🚀 Starting Firecrawl API call...');
  const tFc = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    console.log('⏱️ Firecrawl timeout triggered');
    ctrl.abort();
  }, 18000);

  const formats = ["markdown", "html"]; // Simplified formats
  const requestPayload = { 
    url: psaUrl, 
    formats,
    timeout: 18000,
    waitFor: 2000
  };
  
  console.log('📦 Firecrawl request payload:', JSON.stringify(requestPayload));

  let firecrawlStatus: number | null = null;
  let payload: FirecrawlResult | null = null;
  let success = false;
  let errorMessage = "";

  try {
    console.log('📡 Making Firecrawl API request...');
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${apiKey}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify(requestPayload),
      signal: ctrl.signal
    });
    
    firecrawlStatus = resp.status;
    console.log('📊 Firecrawl response status:', firecrawlStatus);
    
    if (!resp.ok) {
      const errorText = await resp.text();
      console.log('❌ Firecrawl error response:', errorText);
      throw new Error(`Firecrawl API error: ${firecrawlStatus} - ${errorText}`);
    }
    
    payload = await resp.json();
    console.log('✅ Firecrawl response received, payload keys:', Object.keys(payload || {}));
    success = true;
    
  } catch (e:any) {
    clearTimeout(timer);
    errorMessage = `Firecrawl fetch error: ${e?.name || "Error"}: ${e?.message || String(e)}`;
    console.log('💥 Firecrawl error:', errorMessage);
    console.log('💥 Error stack:', e?.stack);
    
    try {
      // Log the failed request
      await supabase.from('psa_request_log').insert({
        ip_address: clientIP,
        cert_number: cert,
        success: false,
        response_time_ms: Date.now() - requestStart,
        error_message: errorMessage
      });
      console.log('📝 Failed request logged to database');
    } catch (logError) {
      console.log('❌ Failed to log error to database:', logError);
    }

    return json200(req, {
      ok:false,
      error: errorMessage,
      diagnostics:{ hadApiKey:true, firecrawlStatus, firecrawlMs: Date.now()-tFc, settingsMs, totalMs: Date.now()-started }
    });
  } finally {
    clearTimeout(timer);
  }

  const firecrawlMs = Date.now() - tFc;
  console.log('⏱️ Firecrawl took:', firecrawlMs, 'ms');
  
  const data = payload?.data ?? payload ?? {};
  const html: string = data?.html || data?.content || payload?.html || "";
  const markdown: string = data?.markdown || payload?.markdown || "";
  
  console.log('📄 Content received:');
  console.log('- HTML length:', html.length);
  console.log('- Markdown length:', markdown.length);
  console.log('- HTML first 200 chars:', html.substring(0, 200));
  console.log('- Markdown first 200 chars:', markdown.substring(0, 200));

  if (!html && !markdown) {
    errorMessage = "No html/markdown returned from Firecrawl";
    console.log('❌', errorMessage);
    
    try {
      // Log the failed request
      await supabase.from('psa_request_log').insert({
        ip_address: clientIP,
        cert_number: cert,
        success: false,
        response_time_ms: Date.now() - requestStart,
        error_message: errorMessage
      });
    } catch (logError) {
      console.log('❌ Failed to log empty content error:', logError);
    }

    return json200(req, {
      ok:false,
      error: errorMessage,
      diagnostics:{ hadApiKey:true, firecrawlStatus, firecrawlMs, settingsMs, totalMs: Date.now()-started }
    });
  }

  console.log('🔍 Starting data extraction...');
  const text = (html || markdown).replace(/\s+/g, " ").trim();
  const pick = (re: RegExp) => {
    const match = text.match(re);
    const result = match ? match[1].trim() : null;
    console.log('🔍 Extract pattern:', re.toString(), '→', result);
    return result;
  };

  // Enhanced parsing with better patterns
  const isValid = text.includes('PSA Certification Verification') && 
                 !text.includes('not found') && 
                 !text.includes('No results found');
  
  console.log('✅ Certificate validity check:', isValid);

  const norm: PSACertificateData = {
    certNumber: cert,
    isValid,
    grade: pick(/Item Grade[:\s]*([A-Z0-9\s.+/-]+)/i),
    year: pick(/Year[:\s]*([0-9]{4})/i),
    brandTitle: pick(/Brand\/Title[:\s]*([^\n\r]+)/i),
    subject: pick(/Subject[:\s]*([^\n\r]+)/i),
    cardNumber: pick(/Card Number[:\s]*([A-Z0-9\-#]+)/i),
    varietyPedigree: pick(/Variety\/Pedigree[:\s]*([^\n\r]+)/i),
    category: pick(/Category[:\s]*([^\n\r]+)/i),
    psaUrl,
    rawHtml: html,
    rawMarkdown: markdown,
    firecrawlResponse: payload
  };
  
  console.log('📊 Extracted certificate data:', JSON.stringify(norm, null, 2));

  const imgs: string[] = [];
  if (html) {
    const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i)?.[1];
    if (og) imgs.push(og);
    const tags = html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi) || [];
    for (const t of tags) {
      const u = t.match(/src=['"]([^'"]+)['"]/i)?.[1];
      if (u && !imgs.includes(u)) imgs.push(u);
    }
  }

  norm.imageUrl = imgs[0] ?? null;
  norm.imageUrls = imgs;

  // Save to database
  console.log('💾 Saving to database...');
  try {
    const { error: dbError } = await supabase
      .from('psa_certificates')
      .upsert({
        cert_number: cert,
        is_valid: norm.isValid,
        grade: norm.grade,
        year: norm.year,
        brand: norm.brandTitle,
        subject: norm.subject,
        card_number: norm.cardNumber,
        variety_pedigree: norm.varietyPedigree,
        category: norm.category,
        psa_url: norm.psaUrl,
        image_url: norm.imageUrl,
        image_urls: norm.imageUrls,
        raw_html: norm.rawHtml,
        raw_markdown: norm.rawMarkdown,
        firecrawl_response: norm.firecrawlResponse,
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cert_number'
      });

    if (dbError) {
      console.log('❌ Database save error:', dbError);
    } else {
      console.log('✅ Successfully saved to database');
    }

    // Log the successful request
    await supabase.from('psa_request_log').insert({
      ip_address: clientIP,
      cert_number: cert,
      success: true,
      response_time_ms: Date.now() - requestStart
    });
    
    console.log('📝 Request logged successfully');
    
  } catch (dbSaveError) {
    console.log('💥 Database operation failed:', dbSaveError);
  }

  console.log('🎉 Returning successful result');
  const totalMs = Date.now() - started;
  console.log('⏱️ Total request time:', totalMs, 'ms');
  
  return json200(req, {
    ok: true,
    source: "firecrawl_scrape",
    url: psaUrl,
    ...norm,
    diagnostics: {
      hadApiKey: true,
      firecrawlStatus,
      settingsMs,
      firecrawlMs,
      totalMs,
      formats,
      usedCache: false,
      dbSaved: true
    },
  });
}