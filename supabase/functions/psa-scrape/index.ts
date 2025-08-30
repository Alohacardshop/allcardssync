import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PSA Public API helper functions
async function fetchPSACardData(cert: string, apiToken: string) {
  console.log(`Fetching PSA card data for cert: ${cert}`);
  
  try {
    const response = await Promise.race([
      fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert}`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json',
        },
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("PSA card data API timeout")), 15000)
      )
    ]) as Response;

    console.log(`PSA API card data response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`PSA API card data failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log("PSA API card data response:", JSON.stringify(data, null, 2));
    
    if (!data?.IsValidRequest || !data?.PSACert) {
      console.log("PSA API returned invalid or empty card data");
      return null;
    }

    return data.PSACert;
  } catch (error) {
    console.error("Error fetching PSA card data:", error);
    return null;
  }
}

async function fetchPSAImages(cert: string, apiToken: string) {
  console.log(`Fetching PSA images for cert: ${cert}`);
  
  try {
    const response = await Promise.race([
      fetch(`https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${cert}`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json',
        },
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("PSA images API timeout")), 15000)
      )
    ]) as Response;

    console.log(`PSA API images response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`PSA API images failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log("PSA API images response:", JSON.stringify(data, null, 2));
    
    if (!data?.IsValidRequest || !data?.PSACertImages || !Array.isArray(data.PSACertImages)) {
      console.log("PSA API returned invalid or empty image data");
      return null;
    }

    return data.PSACertImages;
  } catch (error) {
    console.error("Error fetching PSA images:", error);
    return null;
  }
}

function mapPSACardData(psaCard: any) {
  return {
    cert: psaCard.CertNumber?.toString(),
    certNumber: psaCard.CertNumber?.toString(),
    subject: psaCard.Subject,
    cardName: psaCard.Subject,
    year: psaCard.Year?.toString(),
    brandTitle: psaCard.Brand,
    category: psaCard.Category,
    grade: psaCard.CardGrade ? `PSA ${psaCard.CardGrade}` : undefined,
    cardNumber: psaCard.CardNumber,
    title: `${psaCard.Year || ''} ${psaCard.Brand || ''} ${psaCard.Subject || ''}`.trim() || `PSA Cert ${psaCard.CertNumber}`,
    // Legacy fields for backwards compatibility
    player: psaCard.Subject,
    set: psaCard.Brand,
    game: psaCard.Category
  };
}

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

  console.log("PSA function called with method:", req.method);

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));
    
    const { cert } = body;
    if (!cert) {
      console.log("No cert provided in request");
      return new Response(JSON.stringify({ ok: false, error: "Missing cert parameter" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Use Firecrawl scraping as primary method
    console.log("Using Firecrawl scraping for PSA data...");
    
    let scrapedResult = null;
    let imageUrl = null;
    let imageUrls = [];
    let source = 'scrape';
      
      const url = `https://www.psacard.com/cert/${encodeURIComponent(cert)}/psa`;
      console.log("PSA URL to scrape:", url);

      console.log("Getting Firecrawl API key from system settings...");
      const { data: apiKeySetting, error: keyError } = await supabase.functions.invoke('get-system-setting', {
        body: { 
          keyName: 'FIRECRAWL_API_KEY',
          fallbackSecretName: 'FIRECRAWL_API_KEY'
        }
      });

      if (!keyError && apiKeySetting?.value) {
        const apiKey = apiKeySetting.value;
        console.log("Firecrawl API key found, attempting scrape...");

        try {
          console.log("Making Firecrawl API request...");

          // Optimized timeout for Firecrawl (15 seconds)
          const fcResp = await Promise.race([
            fetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url,
                formats: ["html", "markdown"],
              }),
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Firecrawl timeout after 15 seconds")), 15000)
            )
          ]) as Response;

          console.log("Firecrawl API response status:", fcResp.status);

          if (fcResp.ok) {
            const fcJson = await fcResp.json();
            const data = fcJson?.data || {};
            const html: string = data.html || data.content || "";
            const markdown: string = data.markdown || "";

            if (html || markdown) {
              const htmlContent = html || markdown;
              scrapedResult = await extractDataFromHTML(htmlContent, cert);
              
              // Extract image from scraped content
              if (html) {
                imageUrl = extractImageFromHTML(html, cert);
                if (imageUrl) {
                  imageUrls.push(imageUrl);
                }
              }
              
              console.log("Firecrawl scraping successful");
              source = 'scrape';
            }
          } else {
            console.log(`Firecrawl failed with status: ${fcResp.status}`);
          }
        } catch (scrapeError) {
          console.error("Firecrawl scraping error:", scrapeError);
        }
      } else {
        console.error("FIRECRAWL_API_KEY not found, cannot scrape");
      }

    // Return results
    const finalResult = scrapedResult;
    
    if (!finalResult) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to retrieve PSA data from both API and scraping methods",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = {
      ok: true,
      url: `https://www.psacard.com/cert/${encodeURIComponent(cert)}/psa`,
      ...finalResult,
      imageUrl,
      imageUrls,
      source,
      // Metadata
      apiSuccess: false,
      scrapeSuccess: !!scrapedResult
    };

    console.log("Final result:", JSON.stringify(result, null, 2));
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("PSA function error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function extractImageFromHTML(html: string, cert?: string): string | null {
  const PLACEHOLDERS = [/ErrorWagner\.png/i, /noimage/i, /placeholder/i, /blank/i];
  const isPlaceholder = (u: string) => PLACEHOLDERS.some((re) => re.test(u));

  // 1) Prefer CloudFront cert-specific URLs
  if (cert) {
    const cfRe = new RegExp(
      `https?:\/\/[^"']*cloudfront\\.net\/[^"']*cert\/${cert}[^"']*\\.(?:jpg|jpeg|png|webp)`,
      'i'
    );
    const cfMatch = html.match(cfRe);
    if (cfMatch) {
      const url = cfMatch[1] || cfMatch[0];
      if (!isPlaceholder(url)) {
        console.log('Found CloudFront cert image:', url);
        return url;
      }
    }
  }

  const candidates: string[] = [];

  // 2) Collect from <img src|data-src|data-original>
  const imgAttrRe = /<img[^>]+(?:src|data-src|data-original)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgAttrRe.exec(html)) !== null) {
    candidates.push(m[1]);
  }

  // 3) Collect from <source srcset>
  const sourceSetRe = /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
  let s: RegExpExecArray | null;
  while ((s = sourceSetRe.exec(html)) !== null) {
    const parts = s[1]
      .split(',')
      .map((p) => p.trim().split(' ')[0])
      .filter(Boolean);
    candidates.push(...parts);
  }

  // 4) og:image
  const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogMatch) candidates.push(ogMatch[1]);

  // 5) JSON-LD image
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1].trim());
      const ldImage = typeof jsonLd?.image === 'string'
        ? jsonLd.image
        : jsonLd?.image?.url || (Array.isArray(jsonLd?.image) ? jsonLd.image[0] : undefined);
      if (ldImage) candidates.push(ldImage);
    } catch (_) {
      // ignore
    }
  }

  // 6) Add legacy patterns as fallbacks
  const legacyPatterns = [
    /<img[^>]+src=["']([^"']*psacard\.com[^"']*card[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /<img[^>]+src=["']([^"']*psacard\.cloud[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /<img[^>]+src=["']([^"']*card[^"']*image[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /<img[^>]+src=["']([^"']*cert[^"']*image[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ];
  for (const p of legacyPatterns) {
    const mm = html.match(p);
    if (mm) candidates.push(mm[1]);
  }

  // Dedupe and filter placeholders
  const uniq = Array.from(new Set(candidates)).filter((u) => !isPlaceholder(u));
  if (uniq.length === 0) {
    console.log('No usable image found in HTML');
    return null;
  }

  // Ranking
  const byPriority = (u: string) => {
    const score = [
      cert && /cloudfront\.net/i.test(u) && new RegExp(`/cert/${cert}(/|$)`).test(u) ? 100 : 0,
      /cloudfront\.net/i.test(u) ? 50 : 0,
      /\/cert\//i.test(u) ? 25 : 0,
      /front/i.test(u) ? 10 : 0,
    ].reduce((a, b) => a + b, 0);
    return score;
  };

  uniq.sort((a, b) => byPriority(b) - byPriority(a));
  console.log('Selected image candidate:', uniq[0]);
  return uniq[0] || null;
}

// Helper functions for normalization
function normalizeGrade(gradeText: string): { psa: string; numeric: number | null; display: string } {
  if (!gradeText) return { psa: '', numeric: null, display: '' };
  
  // Extract numeric grade
  const numericMatch = gradeText.match(/(\d+(?:\.\d+)?)/);
  const numeric = numericMatch ? parseFloat(numericMatch[1]) : null;
  
  // Create PSA format
  const psa = numeric ? `PSA ${numeric}` : gradeText;
  
  // Create display format (preserve original descriptive text)
  let display = gradeText;
  if (gradeText.match(/GEM\s*MT/i) && numeric) {
    display = `GEM MT ${numeric}`;
  } else if (gradeText.match(/MINT/i) && numeric) {
    display = `MINT ${numeric}`;
  } else if (numeric && !gradeText.includes('PSA')) {
    display = `PSA ${numeric}`;
  }
  
  return { psa, numeric, display };
}

function normalizeGame(gameText: string): string {
  if (!gameText) return '';
  
  const game = gameText.toLowerCase().trim();
  
  // Pokemon variants
  if (game.includes('pokemon') || game.includes('pokémon')) {
    if (game.includes('japan')) return 'pokemon-japan';
    return 'pokemon';
  }
  
  // Magic variants
  if (game.includes('magic') || game.includes('mtg')) {
    return 'mtg';
  }
  
  // Sports cards
  if (game.includes('baseball')) return 'baseball';
  if (game.includes('football')) return 'football';
  if (game.includes('basketball')) return 'basketball';
  if (game.includes('hockey')) return 'hockey';
  if (game.includes('soccer')) return 'soccer';
  
  // TCG fallback
  if (game.includes('tcg')) return 'tcg';
  
  return game;
}

async function extractDataFromHTML(htmlContent: string, cert: string) {
  console.log("Extracting data from HTML content (length:", htmlContent.length, ")");

  // Attempt JSON-LD extraction first
  const ld = safeJsonLd(htmlContent);
  let title: string | undefined;
  let player: string | undefined;
  let setName: string | undefined;
  let year: string | undefined;
  let grade: string | undefined;
  let psaEstimate: string | undefined;

  if (ld) {
    console.log("Found JSON-LD data:", JSON.stringify(ld, null, 2));
    title = ld.name || ld.headline || ld.title;
    const desc: string | undefined = ld.description;
    if (desc) {
      const yearM = desc.match(/\b(19|20)\d{2}\b/);
      if (yearM) year = yearM[0];
      const gradeM = desc.match(/PSA\s*([0-9]+(?:\.[0-9])?)/i);
      if (gradeM) grade = `PSA ${gradeM[1]}`;
    }
  }

  // Fallbacks: more flexible regex patterns
  const text = htmlContent;
  
  // Log a sample of the content to debug
  console.log("HTML sample (first 1000 chars):", text.substring(0, 1000));

  // Enhanced grade extraction with multiple patterns
  grade = grade ||
    // Table-based extraction
    extract(text, /Grade[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    // Label-value patterns
    extract(text, /Grade[:\s]*((?:GEM\s*MT|MINT|PSA)?\s*\d+(?:\.\d+)?)/i) ||
    // Direct PSA pattern
    extract(text, /PSA\s*(\d+(?:\.\d+)?)/i) ||
    // Grade number only
    extract(text, /(?:Grade|graded?)[:\s]*(\d+(?:\.\d+)?)/i);
    
  console.log("Extracted grade:", grade);

  // Enhanced year extraction
  year = year ||
    extract(text, /Year[^>]*>[\s\S]*?<[^>]*>\s*(\d{4})\s*</i) ||
    extract(text, /\b(19\d{2}|20[0-2]\d)\b/) ||
    extract(text, /(\d{4})\s*(?:Topps|Panini|Upper|Leaf|Score)/i);
    
  console.log("Extracted year:", year);
    
  // Enhanced set/brand extraction  
  setName = setName || 
    extract(text, /Set[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Brand[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i);
    
  console.log("Extracted set:", setName);
  
  // PSA Estimate extraction with flexible patterns
  psaEstimate = 
    extract(text, /PSA\s*Price[^>]*>[\s\S]*?\$?([0-9,]+(?:\.[0-9]{2})?)/i) ||
    extract(text, /Price\s*Guide[^>]*>[\s\S]*?\$?([0-9,]+(?:\.[0-9]{2})?)/i) ||
    extract(text, /(?:PSA\s*)?(?:Price|Value|Estimate)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
    
  console.log("Extracted PSA estimate:", psaEstimate);

  // Enhanced name/subject extraction
  const cardName: string | undefined =
    extract(text, /Card\s*Name[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Player[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Subject[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    player;
    
  console.log("Extracted card name:", cardName);

  // Enhanced game/sport detection
  const game: string | undefined =
    extract(text, /Sport[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Game[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Category[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /(?:Sport|Game|Category)[:\s]*([A-Za-z][A-Za-z0-9\s\-\/&]+)/i);
    
  console.log("Extracted game:", game);

  // Enhanced card number extraction
  const cardNumber: string | undefined =
    extract(text, /Card\s*(?:#|No\.?|Number)[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /(?:Card\s*(?:#|No\.?|Number)|#)[:\s]*([A-Za-z0-9\-\.\/]+)/i);
    
  console.log("Extracted card number:", cardNumber);

  // Enhanced brand/title extraction
  const brandTitle: string | undefined =
    extract(text, /Brand[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Title[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /(?:Brand|Title)[:\s]*([^\n<]+)/i);
    
  console.log("Extracted brand title:", brandTitle);

  // Enhanced subject extraction
  const subject: string | undefined =
    extract(text, /Subject[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Subject[:\s]*([^\n<]+)/i) ||
    cardName;
    
  console.log("Extracted subject:", subject);

  // Enhanced category extraction
  const category: string | undefined =
    extract(text, /Category[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Category[:\s]*([A-Za-z][A-Za-z0-9\s\-\/&]+)/i) ||
    game;
    
  console.log("Extracted category:", category);

  // Enhanced variety/pedigree extraction
  const varietyPedigree: string | undefined =
    extract(text, /Variety[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /Pedigree[^>]*>[\s\S]*?<[^>]*>\s*([^<]+?)\s*</i) ||
    extract(text, /(?:Variety|Pedigree)[:\s]*([^\n<]+)/i);
    
  console.log("Extracted variety:", varietyPedigree);

  // Enhanced title extraction - try multiple approaches
  title = title || 
    extract(text, /<title>\s*([^<]+?)\s*<\/title>/i) ||
    extract(text, /<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i) ||
    extract(text, /og:title[^>]*content=["']([^"']+)["']/i);
    
  console.log("Extracted title:", title);
  if (!title) {
    const parts = [year, cardName, setName].filter(Boolean).join(" ");
    title = parts || `PSA Cert ${cert}`;
  }

  // Normalize grade and game
  const normalizedGrade = normalizeGrade(grade || '');
  const normalizedGame = normalizeGame(game || brandTitle || category || '');

  return {
    cert: String(cert),
    certNumber: String(cert),
    title,
    cardName: cardName || undefined,
    year: year || undefined,
    game: normalizedGame || game || undefined,
    gameRaw: game || undefined,
    cardNumber: cardNumber || undefined,
    grade: normalizedGrade.psa || grade || undefined,
    gradeNumeric: normalizedGrade.numeric,
    gradeDisplay: normalizedGrade.display || grade || undefined,
    category: category || undefined,
    brandTitle: brandTitle || undefined,
    subject: subject || undefined,
    varietyPedigree: varietyPedigree || undefined,
    psaEstimate: psaEstimate || undefined,
    // Back-compat fields
    player: player || cardName || undefined,
    set: setName || undefined,
  };
}
