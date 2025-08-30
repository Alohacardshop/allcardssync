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
  if (!/^\d{5,}$/.test(cert)) return json200(req, { ok:false, error:"Missing or invalid cert parameter (digits)" });

  const psaUrl = `https://www.psacard.com/cert/${cert}/psa`;

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

  // Firecrawl call
  const tFc = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);

  const formats = Array.isArray(body?.formats) && body.formats.length ? body.formats : ["extract","html"];
  const proxyMode = body?.stealth ? "stealth" : (body?.proxyMode ?? "basic");
  const maxAge = typeof body?.maxAge === "number" ? body.maxAge : 0;

  let firecrawlStatus: number | null = null;
  let payload: FirecrawlResult | null = null;

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: psaUrl, formats, timeout: 18000, waitFor: 2000, maxAge, proxy: { mode: proxyMode } }),
      signal: ctrl.signal
    });
    firecrawlStatus = resp.status;
    payload = await resp.json();
  } catch (e:any) {
    clearTimeout(timer);
    return json200(req, {
      ok:false,
      error:`Firecrawl fetch error: ${e?.name || "Error"}: ${e?.message || String(e)}`,
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
    return json200(req, {
      ok:false,
      error:"No html/markdown returned from Firecrawl",
      diagnostics:{ hadApiKey:true, firecrawlStatus, firecrawlMs, settingsMs, totalMs: Date.now()-started }
    });
  }

  const text = (html || markdown).replace(/\s+/g, " ").trim();
  const pick = (re: RegExp) => (text.match(re)?.[1] || "").trim() || null;

  const norm = {
    certNumber: cert,
    grade:           pick(/Item Grade[:\s]*([A-Z0-9\s.+/-]+)/i),
    year:            pick(/Year[:\s]*([0-9]{4})/i),
    brandTitle:      pick(/Brand\/Title[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
    subject:         pick(/Subject[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
    cardNumber:      pick(/Card Number[:\s]*([A-Z0-9\-]+)\b/i),
    varietyPedigree: pick(/Variety\/Pedigree[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
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

  return json200(req, {
    ok: true,
    source: data?.extract && html ? "firecrawl_structured" : "firecrawl_html",
    url: psaUrl,
    ...norm,
    imageUrl: imgs[0] ?? null,
    imageUrls: imgs,
    diagnostics: {
      hadApiKey: true,
      firecrawlStatus,
      settingsMs,
      firecrawlMs,
      totalMs: Date.now() - started,
      proxyMode,
      formats,
      usedCache: typeof (data?.cached ?? data?.meta?.cached) === "boolean" ? (data.cached ?? data.meta.cached) : undefined,
    },
  });
}