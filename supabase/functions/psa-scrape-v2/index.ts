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
  const hdrs = corsHeadersFor(req);

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: hdrs });
  if (req.method !== "POST")    return new Response(JSON.stringify({ ok:false, error:"Use POST" }), { status:200, headers:hdrs });

  let body: any = {};
  try { body = await req.json(); } catch {}

  // Lightweight reachability check
  if (body?.mode === "ping") {
    return json200(req, { ok:true, message:"psa-scrape-v2 reachable", diagnostics:{ totalMs: Date.now()-started } });
  }

  const cert = String(body?.cert ?? "").trim();
  if (!/^\d{8,9}$/.test(cert)) return json200(req, { ok:false, error:"Invalid certificate number (must be 8-9 digits)" });

  const psaUrl = `https://www.psacard.com/cert/${cert}/psa`;
  
  // Check if we have a recent cached result (within 24 hours)
  const { data: existingCert } = await supabase
    .from('psa_certificates')
    .select('*')
    .eq('cert_number', cert)
    .gte('scraped_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 24 hours ago
    .single();

  if (existingCert) {
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

  // Firecrawl key (env first)
  const tKey = Date.now();
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
  const settingsMs = Date.now() - tKey;
  if (!apiKey) {
    return json200(req, {
      ok:false,
      error:"FIRECRAWL_API_KEY not configured",
      diagnostics:{ hadApiKey:false, settingsMs, totalMs: Date.now()-started }
    });
  }

  // Log the request
  const requestStart = Date.now();
  const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  // Firecrawl call
  const tFc = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);

  const formats = Array.isArray(body?.formats) && body.formats.length ? body.formats : ["extract","html"];
  const proxyMode = body?.stealth ? "stealth" : (body?.proxyMode ?? "basic");
  const maxAge = typeof body?.maxAge === "number" ? body.maxAge : 0;

  let firecrawlStatus: number | null = null;
  let payload: FirecrawlResult | null = null;
  let success = false;
  let errorMessage = "";

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: psaUrl, formats, timeout: 18000, waitFor: 2000, maxAge, proxy: { mode: proxyMode } }),
      signal: ctrl.signal
    });
    firecrawlStatus = resp.status;
    payload = await resp.json();
    success = true;
  } catch (e:any) {
    clearTimeout(timer);
    errorMessage = `Firecrawl fetch error: ${e?.name || "Error"}: ${e?.message || String(e)}`;
    
    // Log the failed request
    await supabase.from('psa_request_log').insert({
      ip_address: clientIP,
      cert_number: cert,
      success: false,
      response_time_ms: Date.now() - requestStart,
      error_message: errorMessage
    });

    return json200(req, {
      ok:false,
      error: errorMessage,
      diagnostics:{ hadApiKey:true, firecrawlStatus, firecrawlMs: Date.now()-tFc, settingsMs, totalMs: Date.now()-started }
    });
  } finally {
    clearTimeout(timer);
  }

  const firecrawlMs = Date.now() - tFc;
  const data = payload?.data ?? payload ?? {};
  const html: string = data?.html || data?.content || payload?.html || "";
  const markdown: string = data?.markdown || payload?.markdown || "";

  if (!html && !markdown) {
    errorMessage = "No html/markdown returned from Firecrawl";
    
    // Log the failed request
    await supabase.from('psa_request_log').insert({
      ip_address: clientIP,
      cert_number: cert,
      success: false,
      response_time_ms: Date.now() - requestStart,
      error_message: errorMessage
    });

    return json200(req, {
      ok:false,
      error: errorMessage,
      diagnostics:{ hadApiKey:true, firecrawlStatus, firecrawlMs, settingsMs, totalMs: Date.now()-started }
    });
  }

  const text = (html || markdown).replace(/\s+/g, " ").trim();
  const pick = (re: RegExp) => (text.match(re)?.[1] || "").trim() || null;

  // Enhanced parsing with better patterns
  const isValid = text.includes('PSA Certification Verification') && 
                 !text.includes('not found') && 
                 !text.includes('No results found');

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
    console.error("Database save error:", dbError);
  }

  // Log the successful request
  await supabase.from('psa_request_log').insert({
    ip_address: clientIP,
    cert_number: cert,
    success: true,
    response_time_ms: Date.now() - requestStart
  });

  return json200(req, {
    ok: true,
    source: data?.extract && html ? "firecrawl_structured" : "firecrawl_html",
    url: psaUrl,
    ...norm,
    diagnostics: {
      hadApiKey: true,
      firecrawlStatus,
      settingsMs,
      firecrawlMs,
      totalMs: Date.now() - started,
      proxyMode,
      formats,
      usedCache: typeof (data?.cached ?? data?.meta?.cached) === "boolean" ? (data.cached ?? data.meta.cached) : undefined,
      dbSaved: !dbError
    },
  });
}