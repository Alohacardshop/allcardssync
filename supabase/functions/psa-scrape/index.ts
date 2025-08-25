import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extract(html: string, regex: RegExp): string | undefined {
  const m = html.match(regex);
  return m?.[1]?.trim();
}

function safeJsonLd(html: string): any | null {
  try {
    const m = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return null;
    const txt = m[1].trim();
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cert } = await req.json();
    if (!cert) {
      return new Response(JSON.stringify({ ok: false, error: "Missing cert" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://www.psacard.com/cert/${encodeURIComponent(cert)}/psa`;
    
    // Get Firecrawl API key from system_settings table
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: apiKeySetting } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'FIRECRAWL_API_KEY',
        fallbackSecretName: 'FIRECRAWL_API_KEY'
      }
    });

    const apiKey = apiKeySetting?.value;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "FIRECRAWL_API_KEY is not configured in system settings",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("psa-scrape (firecrawl) request", { cert, url });

    // Use Firecrawl Scrape API to fetch the page HTML
    const fcResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html", "markdown"],
      }),
    });

    console.log("psa-scrape (firecrawl) status", fcResp.status);

    if (!fcResp.ok) {
      const bodyText = await fcResp.text().catch(() => "");
      let errorJson: any = null;
      try { errorJson = JSON.parse(bodyText); } catch (_) {}
      const bodySnippet = bodyText.slice(0, 500);
      console.log("psa-scrape (firecrawl) error body", bodySnippet);
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Firecrawl request failed (${fcResp.status})`,
          status: fcResp.status,
          bodySnippet,
          errorJson,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fcJson = (await fcResp.json().catch(() => null)) as any;
    // Firecrawl typically returns: { success: boolean, data: { html?: string, markdown?: string, ... } }
    const data = fcJson?.data || {};
    const html: string = data.html || data.content || "";
    const markdown: string = data.markdown || "";

    if (!html && !markdown) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "No content returned from Firecrawl",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const source = html || markdown;

    // Attempt JSON-LD extraction first
    const ld = html ? safeJsonLd(html) : null;
    let title: string | undefined;
    let player: string | undefined;
    let setName: string | undefined;
    let year: string | undefined;
    let grade: string | undefined;

    if (ld) {
      title = ld.name || ld.headline || ld.title;
      const desc: string | undefined = ld.description;
      if (desc) {
        const yearM = desc.match(/\b(19|20)\d{2}\b/);
        if (yearM) year = yearM[0];
        const gradeM = desc.match(/PSA\s*([0-9]+(?:\.[0-9])?)/i);
        if (gradeM) grade = `PSA ${gradeM[1]}`;
      }
    }

    // Fallbacks: regex scan of the HTML/Markdown
    const text = source;

    // Core fields
    grade =
      grade ||
      extract(text, />\s*Grade\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,40})\s*</i) ||
      extract(text, /PSA\s*([0-9]+(?:\.[0-9])?)/i);
    year =
      year ||
      extract(text, />\s*Year\s*<[^>]*>[\s\S]*?<[^>]*>\s*(\d{4})\s*</i) ||
      extract(text, /\b(19|20)\d{2}\b/);
    setName = setName || extract(text, />\s*Set\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,120})\s*</i);

    // Name fields
    const cardName: string | undefined =
      extract(text, />\s*Card\s*Name\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,120})\s*</i) ||
      extract(text, />\s*Player\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,120})\s*</i) ||
      player;

    // Game/Sport
    const game: string | undefined =
      extract(
        text,
        />\s*(?:Sport|Game|Category)\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,80})\s*</i
      ) || extract(text, /(?:Sport|Game|Category):\s*([A-Za-z][A-Za-z0-9\s\-\/&]+)/i);

    // Card number
    const cardNumber: string | undefined =
      extract(
        text,
        />\s*(?:Card\s*(?:#|No\.?|Number))\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,40})\s*</i
      ) || extract(text, /(?:Card\s*(?:#|No\.?|Number))[:\s]*([A-Za-z0-9\-\.]{1,20})/i);

    // Additional PSA fields
    const brandTitle: string | undefined =
      extract(
        text,
        />\s*Brand\/?\s*Title\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,160})\s*</i
      ) || extract(text, /(?:Brand\/?\s*Title)[:\s]*([^\n<]{1,160})/i);

    const subject: string | undefined =
      extract(text, />\s*Subject\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,160})\s*</i) ||
      extract(text, /Subject[:\s]*([^\n<]{1,160})/i);

    const category: string | undefined =
      extract(text, />\s*Category\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,80})\s*</i) ||
      extract(text, /Category[:\s]*([A-Za-z][A-Za-z0-9\s\-\/&]+)/i);

    const varietyPedigree: string | undefined =
      extract(
        text,
        />\s*Variety\/?\s*Pedigree\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,160})\s*</i
      ) || extract(text, /Variety\/?\s*Pedigree[:\s]*([^\n<]{1,160})/i);

    // Title: try HTML title tag or build from parts
    title = title || extract(text, /<title>\s*([^<]+?)\s*<\/title>/i);
    if (!title) {
      const parts = [year, cardName, setName].filter(Boolean).join(" ");
      title = parts || `PSA Cert ${cert}`;
    }

    const result = {
      ok: true,
      url,
      cert: String(cert),
      certNumber: String(cert),
      title,
      cardName: cardName || undefined,
      year: year || undefined,
      game: game || undefined,
      cardNumber: cardNumber || undefined,
      grade: grade || undefined,
      category: category || undefined,
      brandTitle: brandTitle || undefined,
      subject: subject || undefined,
      varietyPedigree: varietyPedigree || undefined,
      // Back-compat fields
      player: player || cardName || undefined,
      set: setName || undefined,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("psa-scrape (firecrawl) error", error);
    return new Response(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
