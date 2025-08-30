import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple extraction helper
function extractValue(html: string, regex: RegExp): string | undefined {
  const match = html.match(regex);
  return match?.[1]?.trim();
}

// Extract image from HTML content
function extractImage(html: string): string | null {
  // Look for CloudFront images first (highest quality)
  const cloudFrontMatch = html.match(/https?:\/\/[^"']*cloudfront\.net\/[^"']*\.(?:jpg|jpeg|png|webp)/i);
  if (cloudFrontMatch) {
    return cloudFrontMatch[0];
  }

  // Look for any PSA card images
  const imageMatch = html.match(/<img[^>]+src=["']([^"']*(?:card|cert)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
  if (imageMatch) {
    return imageMatch[1];
  }

  return null;
}

// Extract card data from PSA HTML page
function extractCardData(html: string, cert: string) {
  console.log("Extracting PSA card data from HTML...");

  // Extract the main card title/name from the page
  const titleMatch = html.match(/#\d+\s*([^<\n]+?)(?:\s*<|$)/);
  const cardTitle = titleMatch?.[1]?.trim();

  // Extract grade (GEM MT 10, MINT 9, etc.)
  const grade = extractValue(html, /Item Grade\s*([^<\n]+)/i) ||
    extractValue(html, /Grade[^>]*>\s*([^<]+)/i);

  // Extract PSA estimate
  const psaEstimate = extractValue(html, /PSA Estimate\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i);

  // Extract year
  const year = extractValue(html, /Year\s*(\d{4})/i);

  // Extract brand/title
  const brandTitle = extractValue(html, /Brand\/Title\s*([^<\n]+)/i);

  // Extract subject (card name/player)
  const subject = extractValue(html, /Subject\s*([^<\n]+)/i);

  // Extract card number
  const cardNumber = extractValue(html, /Card Number\s*([^<\n]+)/i);

  // Extract category
  const category = extractValue(html, /Category\s*([^<\n]+)/i);

  // Extract variety/pedigree
  const varietyPedigree = extractValue(html, /Variety\/Pedigree\s*([^<\n]+)/i);

  // Build final title
  const parts = [year, brandTitle, subject].filter(Boolean);
  const title = parts.length > 0 ? parts.join(" ") : cardTitle || `PSA Cert ${cert}`;

  // Normalize game from category
  let game = category?.toLowerCase() || '';
  if (game.includes('tcg')) game = 'tcg';
  if (game.includes('pokemon')) game = 'pokemon';
  if (game.includes('magic') || game.includes('mtg')) game = 'mtg';

  // Normalize grade
  let normalizedGrade = grade;
  let gradeNumeric = null;
  if (grade) {
    const numMatch = grade.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      gradeNumeric = parseFloat(numMatch[1]);
      normalizedGrade = `PSA ${gradeNumeric}`;
    }
  }

  console.log("Extracted data:", {
    title, grade: normalizedGrade, year, brandTitle, subject, cardNumber, category, psaEstimate
  });

  return {
    cert: String(cert),
    certNumber: String(cert),
    title,
    cardName: subject,
    year,
    game,
    cardNumber,
    grade: normalizedGrade,
    gradeNumeric,
    gradeDisplay: grade,
    category,
    brandTitle,
    subject,
    varietyPedigree,
    psaEstimate,
    // Legacy compatibility
    player: subject,
    set: brandTitle,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("PSA scraper called:", req.method);

  try {
    const body = await req.json();
    console.log("Request:", JSON.stringify(body, null, 2));
    
    const { cert } = body;
    if (!cert) {
      console.log("Missing cert parameter");
      return new Response(JSON.stringify({ ok: false, error: "Missing cert parameter" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build PSA URL
    const psaUrl = `https://www.psacard.com/cert/${encodeURIComponent(cert)}/psa`;
    console.log("PSA URL:", psaUrl);

    // Get Firecrawl API key
    console.log("Getting Firecrawl API key...");
    const { data: apiKeySetting, error: keyError } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'FIRECRAWL_API_KEY',
        fallbackSecretName: 'FIRECRAWL_API_KEY'
      }
    });

    if (keyError || !apiKeySetting?.value) {
      console.error("Firecrawl API key not found");
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Firecrawl API key not configured" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = apiKeySetting.value;
    console.log("Firecrawl API key found, scraping PSA page...");

    // Scrape PSA page with Firecrawl
    const scrapeResponse = await Promise.race([
      fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: psaUrl,
          formats: ["html"],
        }),
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Firecrawl timeout")), 20000)
      )
    ]) as Response;

    console.log("Firecrawl response status:", scrapeResponse.status);

    if (!scrapeResponse.ok) {
      console.error("Firecrawl failed:", scrapeResponse.status, scrapeResponse.statusText);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Failed to scrape PSA page" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scrapeData = await scrapeResponse.json();
    const html = scrapeData?.data?.html || "";

    if (!html) {
      console.error("No HTML content received from Firecrawl");
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "No content received from PSA page" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("HTML received, extracting card data...");
    
    // Extract card data
    const cardData = extractCardData(html, cert);
    
    // Extract image
    const imageUrl = extractImage(html);
    const imageUrls = imageUrl ? [imageUrl] : [];

    const result = {
      ok: true,
      url: psaUrl,
      ...cardData,
      imageUrl,
      imageUrls,
      source: 'scrape',
      scrapeSuccess: true
    };

    console.log("PSA scrape complete:", JSON.stringify(result, null, 2));
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("PSA scraper error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

