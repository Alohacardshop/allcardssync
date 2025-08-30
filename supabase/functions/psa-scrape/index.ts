// supabase/functions/psa-scrape/index.ts
// Firecrawl-only PSA scraper with CORS, OPTIONS, ping, stealth fallback, and diagnostics.

const ALLOWED_ORIGIN = "*"; // set to your site later (e.g. https://www.alohacardshop.com)
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json200 = (obj: unknown) =>
  new Response(JSON.stringify(obj), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type FirecrawlResult =
  | { data?: any; html?: string; markdown?: string; content?: string }
  | Record<string, any>;

export default async (req: Request) => {
  // 0) Preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json200({ ok: false, error: "Use POST" });

  const t0 = Date.now();
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  // 1) Ping mode for reachability checks (no external calls)
  if (body?.mode === "ping") {
    return json200({ ok: true, message: "psa-scrape reachable", diagnostics: { totalMs: Date.now() - t0 } });
  }

  // 2) Input validation
  const cert = String(body?.cert ?? "").trim();
  if (!/^\d{5,}$/.test(cert)) {
    return json200({ ok: false, error: "Missing or invalid cert parameter (digits only)" });
  }
  const psaUrl = `https://www.psacard.com/cert/${cert}/psa`;

  // 3) Firecrawl key
  const settingsStart = Date.now();
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
  const settingsMs = Date.now() - settingsStart;
  if (!apiKey) {
    return json200({ ok: false, error: "FIRECRAWL_API_KEY not configured", diagnostics: { hadApiKey: false, settingsMs, totalMs: Date.now() - t0 } });
  }

  // 4) Firecrawl call (extract + html) with abort at ~18s
  const fireStart = Date.now();
  const fcCtrl = new AbortController();
  const fcTimer = setTimeout(() => fcCtrl.abort(), 18000);

  const formats = Array.isArray(body?.formats) && body.formats.length
    ? body.formats
    : ["extract", "html"];

  const useStealth = body?.stealth === true; // allow caller to force stealth if needed
  // basic | stealth | auto (if your plan supports it). Default basic for speed.
  const proxyMode = useStealth ? "stealth" : (body?.proxyMode ?? "basic");

  const fcPayload = {
    url: psaUrl,
    formats,
    timeout: 18000,
    waitFor: 2000,
    // Optional cache for faster repeated lookups during testing:
    // e.g. 3600 = reuse up to 1 hour if content hasn't changed
    maxAge: typeof body?.maxAge === "number" ? body.maxAge : 0,
    // Optional proxy/stealth config (comment out if not enabled on your plan)
    proxy: { mode: proxyMode }, // { mode: "basic" | "stealth" | "auto" }
  };

  let firecrawlStatus: number | null = null;
  let firecrawlJson: FirecrawlResult | null = null;
  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(fcPayload),
      signal: fcCtrl.signal,
    });
    firecrawlStatus = resp.status;
    firecrawlJson = (await resp.json()) as FirecrawlResult;
  } catch (e: any) {
    clearTimeout(fcTimer);
    const firecrawlMs = Date.now() - fireStart;
    return json200({
      ok: false,
      error: `Firecrawl fetch error: ${e?.name || "Error"}: ${e?.message || String(e)}`,
      diagnostics: { hadApiKey: true, firecrawlStatus, firecrawlMs, settingsMs, totalMs: Date.now() - t0 },
    });
  } finally {
    clearTimeout(fcTimer);
  }

  const firecrawlMs = Date.now() - fireStart;

  // 5) Normalize Firecrawl payload shapes
  const data = (firecrawlJson as any)?.data ?? firecrawlJson ?? {};
  const html: string = data?.html || (data?.content ?? "") || (firecrawlJson as any)?.html || "";
  const markdown: string = data?.markdown || (firecrawlJson as any)?.markdown || "";

  if (!html && !markdown) {
    return json200({
      ok: false,
      error: "No html/markdown returned from Firecrawl",
      diagnostics: { hadApiKey: true, firecrawlStatus, firecrawlMs, settingsMs, totalMs: Date.now() - t0 },
    });
  }

  // 6) Parse fields (very tolerant: works on HTML or markdown)
  const text = (html || markdown).replace(/\s+/g, " ").trim();

  const pick = (re: RegExp) => {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };

  const norm = {
    certNumber: cert,
    grade: pick(/Item Grade[:\s]*([A-Z0-9\s.+/-]+)/i),
    year: pick(/Year[:\s]*([0-9]{4})/i),
    brandTitle: pick(/Brand\/Title[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
    subject: pick(/Subject[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
    cardNumber: pick(/Card Number[:\s]*([A-Z0-9\-]+)\b/i),
    varietyPedigree: pick(/Variety\/Pedigree[:\s]*([A-Z0-9\s\-&'!:\/.]+)/i),
  };

  // 7) Images (og:image + <img src>)
  const imgs: string[] = [];
  if (html) {
    const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i)?.[1];
    if (og) imgs.push(og);
    const imgTags = html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi) || [];
    for (const tag of imgTags) {
      const u = tag.match(/src=['"]([^'"]+)['"]/i)?.[1];
      if (u && !imgs.includes(u)) imgs.push(u);
    }
  }

  // 8) Done
  return json200({
    ok: true,
    source: html && data?.extract ? "firecrawl_structured" : "firecrawl_html",
    url: psaUrl,
    ...norm,
    imageUrl: imgs[0] ?? null,
    imageUrls: imgs,
    diagnostics: {
      hadApiKey: true,
      firecrawlStatus,
      settingsMs,
      firecrawlMs,
      totalMs: Date.now() - t0,
      proxyMode,
      formats,
      usedCache: typeof (data?.cached ?? (data?.meta?.cached)) === "boolean" ? (data.cached ?? data.meta.cached) : undefined,
    },
  });
};