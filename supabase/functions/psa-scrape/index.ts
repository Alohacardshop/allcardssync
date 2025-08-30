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
  console.log("HTML sample:", html.substring(0, 500));

  // Extract the certificate number and main title
  let certMatch = html.match(/#(\d+)/);
  const certNumber = certMatch?.[1] || cert;

  // Extract the full card description (this contains most of the info)
  const descriptionMatch = html.match(/#\d+\s*([^<]+?)(?:\s*<|$)/);
  const fullDescription = descriptionMatch?.[1]?.trim() || '';
  console.log("Full description found:", fullDescription);

  // Parse the description for components (e.g., "2023 POKEMON JAPANESE SV1A-TRIPLET BEAT #080 MAGIKARP ART RARE")
  let year, brand, cardName, cardNumber, rarity, variety;
  
  if (fullDescription) {
    // Extract year (4 digits at start)
    const yearMatch = fullDescription.match(/^(\d{4})\s+/);
    if (yearMatch) year = yearMatch[1];
    
    // Extract card number (# followed by alphanumeric)
    const numberMatch = fullDescription.match(/#(\w+)/);
    if (numberMatch) cardNumber = numberMatch[1];
    
    // Extract rarity/variety (words at the end like "ART RARE", "HOLO", etc.)
    const rarityMatch = fullDescription.match(/\s+((?:ART\s+)?(?:RARE|HOLO|COMMON|UNCOMMON|PROMO|ULTRA\s+RARE|SECRET\s+RARE).*?)$/i);
    if (rarityMatch) {
      rarity = rarityMatch[1].trim();
      // Check if it's a variety like "ART RARE"
      if (rarity.includes('ART')) variety = rarity;
    }
    
    // Extract card name (usually the last recognizable word before rarity)
    let workingDesc = fullDescription;
    if (yearMatch) workingDesc = workingDesc.replace(yearMatch[0], '').trim();
    if (numberMatch) workingDesc = workingDesc.replace(numberMatch[0], '').trim();
    if (rarityMatch) workingDesc = workingDesc.replace(rarityMatch[0], '').trim();
    
    // The remaining should be brand + card name
    const parts = workingDesc.split(' ');
    if (parts.length >= 2) {
      // Last word is likely the card name, everything else is brand
      cardName = parts[parts.length - 1];
      brand = parts.slice(0, -1).join(' ');
    } else {
      cardName = workingDesc;
    }
  }

  // Extract structured data from HTML tables/sections
  const grade = extractValue(html, /Item Grade\s*([^<\n]+)/i) ||
    extractValue(html, /<td[^>]*>\s*Item Grade\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i) ||
    extractValue(html, /Grade[^>]*>\s*([^<]+)/i);

  const psaEstimate = extractValue(html, /PSA Estimate\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i) ||
    extractValue(html, /<td[^>]*>\s*PSA Estimate\s*<\/td>\s*<td[^>]*>\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i);

  const extractedYear = extractValue(html, /Year\s*(\d{4})/i) ||
    extractValue(html, /<td[^>]*>\s*Year\s*<\/td>\s*<td[^>]*>\s*(\d{4})/i);

  const extractedBrand = extractValue(html, /Brand\/Title\s*([^<\n]+)/i) ||
    extractValue(html, /<td[^>]*>\s*Brand\/Title\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);

  const subject = extractValue(html, /Subject\s*([^<\n]+)/i) ||
    extractValue(html, /<td[^>]*>\s*Subject\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);

  const extractedCardNumber = extractValue(html, /Card Number\s*([^<\n]+)/i) ||
    extractValue(html, /<td[^>]*>\s*Card Number\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);

  const category = extractValue(html, /Category\s*([^<\n]+)/i) ||
    extractValue(html, /<td[^>]*>\s*Category\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);

  const varietyPedigree = extractValue(html, /Variety\/Pedigree\s*([^<\n]+)/i) ||
    extractValue(html, /<td[^>]*>\s*Variety\/Pedigree\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);

  // Use parsed values or fall back to extracted values
  const finalYear = year || extractedYear;
  const finalBrand = brand || extractedBrand;
  const finalCardName = cardName || subject;
  const finalCardNumber = cardNumber || extractedCardNumber;

  // Build final title
  const titleParts = [finalYear, finalBrand, finalCardName].filter(Boolean);
  const title = titleParts.length > 0 ? titleParts.join(" ") : fullDescription || `PSA Cert ${cert}`;

  // Normalize game from category
  let game = (category || '').toLowerCase();
  if (game.includes('tcg')) game = 'tcg';
  if (game.includes('pokemon')) game = 'pokemon';
  if (game.includes('magic') || game.includes('mtg')) game = 'mtg';
  if (game.includes('baseball')) game = 'baseball';
  if (game.includes('football')) game = 'football';
  if (game.includes('basketball')) game = 'basketball';

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

  const extractedData = {
    cert: String(cert),
    certNumber: String(cert),
    title,
    cardName: finalCardName,
    year: finalYear,
    game: game || 'tcg',
    cardNumber: finalCardNumber,
    grade: normalizedGrade,
    gradeNumeric,
    gradeDisplay: grade,
    category,
    brandTitle: finalBrand,
    subject: finalCardName,
    varietyPedigree: varietyPedigree || variety,
    rarity,
    psaEstimate,
    // Legacy compatibility
    player: finalCardName,
    set: finalBrand,
  };

  console.log("Final extracted data:", extractedData);
  return extractedData;
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

    // Build PSA URL
    const psaUrl = `https://www.psacard.com/cert/${encodeURIComponent(cert)}/psa`;
    console.log("PSA URL:", psaUrl);

    // Get Supabase client
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check for Firecrawl API key
    console.log("Checking for Firecrawl API key...");
    let apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    
    if (!apiKey) {
      console.log("Firecrawl API key not in env, checking system settings...");
      try {
        const { data: apiKeySetting, error: keyError } = await supabase.functions.invoke('get-system-setting', {
          body: { 
            keyName: 'FIRECRAWL_API_KEY',
            fallbackSecretName: 'FIRECRAWL_API_KEY'
          }
        });
        
        if (keyError) {
          console.error("System setting error:", keyError);
        } else if (apiKeySetting?.value) {
          apiKey = apiKeySetting.value;
          console.log("Found Firecrawl API key in system settings");
        }
      } catch (settingsError) {
        console.error("Failed to get system settings:", settingsError);
      }
    } else {
      console.log("Found Firecrawl API key in environment");
    }

    if (!apiKey) {
      console.error("No Firecrawl API key found");
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Firecrawl API key not configured. Please add FIRECRAWL_API_KEY to system settings." 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Making Firecrawl request...");
    
    // Make Firecrawl request with shorter timeout
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
          onlyMainContent: false,
          waitFor: 2000, // Wait 2 seconds for page to load
          timeout: 10000 // 10 second timeout for scraping
        }),
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Firecrawl request timeout after 15 seconds")), 15000)
      )
    ]) as Response;

    console.log("Firecrawl response status:", scrapeResponse.status);

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text().catch(() => "Unknown error");
      console.error("Firecrawl failed:", scrapeResponse.status, errorText);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: `Firecrawl request failed: ${scrapeResponse.status} - ${errorText}` 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scrapeData = await scrapeResponse.json();
    console.log("Firecrawl response received, data keys:", Object.keys(scrapeData || {}));
    
    const html = scrapeData?.data?.html || "";

    if (!html) {
      console.error("No HTML content received from Firecrawl");
      console.log("Scrape response:", JSON.stringify(scrapeData, null, 2));
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "No HTML content received from PSA page scraping" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("HTML content received, length:", html.length);
    console.log("HTML preview:", html.substring(0, 200));
    
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

    console.log("PSA scrape complete, extracted fields:", Object.keys(cardData));
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("PSA scraper error:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: `PSA scraper failed: ${(error as Error).message}` 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

