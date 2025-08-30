import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PSA Public API helper functions
async function fetchPSACardData(cert: string, apiToken: string) {
  console.log(`Fetching PSA card data for cert: ${cert}`);
  const response = await fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert}`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
    },
  });

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
}

async function fetchPSAImages(cert: string, apiToken: string) {
  console.log(`Fetching PSA images for cert: ${cert}`);
  const response = await fetch(`https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${cert}`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json',
    },
  });

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

    // Step 1: Primary method - Use Firecrawl scraping first
    console.log("Attempting Firecrawl scraping as primary method...");
    
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

      if (keyError || !apiKeySetting?.value) {
        console.error("FIRECRAWL_API_KEY not found, will try PSA API as fallback");
      } else {
        const apiKey = apiKeySetting.value;
        console.log("Firecrawl API key found, attempting scrape...");

        try {
          console.log("Making Firecrawl API request...");

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
                imageUrl = extractImageFromHTML(html);
                if (imageUrl) {
                  imageUrls.push(imageUrl);
                }
              }
              
              console.log("Firecrawl scraping successful");
            }
          } else {
            console.log(`Firecrawl failed with status: ${fcResp.status}`);
          }
        } catch (scrapeError) {
          console.error("Firecrawl scraping error:", scrapeError);
        }
      }

    // Step 2: If Firecrawl failed, fall back to PSA API
    let psaApiResult = null;
    if (!scrapedResult) {
      console.log("Firecrawl failed, falling back to PSA API...");
      
      // Get PSA API token
      const { data: apiTokenSetting, error: tokenError } = await supabase.functions.invoke('get-system-setting', {
        body: { 
          keyName: 'PSA_PUBLIC_API_TOKEN',
          fallbackSecretName: 'PSA_PUBLIC_API_TOKEN'
        }
      });

      if (!tokenError && apiTokenSetting?.value) {
        console.log("PSA API token found, attempting API calls...");
        const apiToken = apiTokenSetting.value;

        try {
          // Fetch card data and images in parallel
          const [psaCard, psaImages] = await Promise.all([
            fetchPSACardData(cert, apiToken),
            fetchPSAImages(cert, apiToken)
          ]);

          if (psaCard) {
            console.log("PSA API card data retrieved successfully");
            psaApiResult = mapPSACardData(psaCard);
            source = 'psa_api';

            // Process images if available and we don't have one from scraping
            if (psaImages && psaImages.length > 0 && !imageUrl) {
              console.log(`Found ${psaImages.length} images from PSA API`);
              const apiImageUrls = psaImages.map((img: any) => img.ImageURL).filter(Boolean);
              imageUrls.push(...apiImageUrls);
              
              // Prefer front image, fallback to first available
              const frontImage = psaImages.find((img: any) => img.ImageType?.toLowerCase().includes('front'));
              imageUrl = frontImage?.ImageURL || psaImages[0]?.ImageURL || null;
              
              console.log(`Selected primary image from API: ${imageUrl}`);
            }
          }
        } catch (apiError) {
          console.error("PSA API error:", apiError);
        }
      } else {
        console.log("PSA API token not found, skipping API calls");
      }
    }

    // Step 3: Combine results and return
    const finalResult = scrapedResult || psaApiResult;
    
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
      apiSuccess: !!psaApiResult,
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

function extractImageFromHTML(html: string): string | null {
  // Try PSA specific image patterns first
  const psaImagePatterns = [
    // PSA card images with specific patterns
    /<img[^>]+src=["']([^"']*psacard\.com[^"']*card[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /<img[^>]+src=["']([^"']*psacard\.cloud[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /<img[^>]+src=["']([^"']*\.(?:jpg|jpeg|png|webp)[^"']*)[^>]*class=["'][^"']*card[^"']*["']/i,
    // Generic card image patterns
    /<img[^>]+src=["']([^"']*card[^"']*image[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /<img[^>]+src=["']([^"']*cert[^"']*image[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
  ];

  for (const pattern of psaImagePatterns) {
    const match = html.match(pattern);
    if (match) {
      console.log("Found PSA card image:", match[1]);
      return match[1];
    }
  }

  // Try og:image
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    console.log("Found og:image:", ogImageMatch[1]);
    return ogImageMatch[1];
  }

  // Try JSON-LD image
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1].trim());
      if (jsonLd.image) {
        const imageUrl = typeof jsonLd.image === 'string' ? jsonLd.image : jsonLd.image.url || jsonLd.image[0];
        if (imageUrl) {
          console.log("Found JSON-LD image:", imageUrl);
          return imageUrl;
        }
      }
    } catch (e) {
      console.log("Could not parse JSON-LD for image");
    }
  }

  // Look for any high quality images
  const genericImagePatterns = [
    /<img[^>]+src=["']([^"']*\.(?:jpg|jpeg|png|webp)[^"']*)[^>]*(?:width=["'][5-9]\d{2,}["']|height=["'][5-9]\d{2,}["'])/i,
    /<img[^>]+(?:width=["'][5-9]\d{2,}["']|height=["'][5-9]\d{2,}["'])[^>]*src=["']([^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i
  ];

  for (const pattern of genericImagePatterns) {
    const match = html.match(pattern);
    if (match) {
      console.log("Found high-res image:", match[1]);
      return match[1];
    }
  }

  console.log("No image found in HTML");
  return null;
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

  // Attempt JSON-LD extraction first
  const ld = safeJsonLd(htmlContent);
  let title: string | undefined;
  let player: string | undefined;
  let setName: string | undefined;
  let year: string | undefined;
  let grade: string | undefined;
  let psaEstimate: string | undefined;

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

  // Fallbacks: regex scan of the HTML content
  const text = htmlContent;

  // Core fields with enhanced extraction
  grade =
    grade ||
    extract(text, />\s*(?:Item\s*)?Grade\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,40})\s*</i) ||
    extract(text, /Grade[:\s]*(GEM\s*MT\s*\d+|MINT\s*\d+|PSA\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?)/i) ||
    extract(text, /PSA\s*([0-9]+(?:\.[0-9])?)/i);
    
  year =
    year ||
    extract(text, />\s*Year\s*<[^>]*>[\s\S]*?<[^>]*>\s*(\d{4})\s*</i) ||
    extract(text, /\b(19|20)\d{2}\b/);
    
  setName = setName || extract(text, />\s*Set\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,120})\s*</i);
  
  // PSA Estimate extraction
  psaEstimate = 
    extract(text, />\s*PSA\s*Price\s*Guide\s*<[^>]*>[\s\S]*?<[^>]*>\s*\$?([^<]{1,20})\s*</i) ||
    extract(text, /PSA\s*(?:Price\s*)?(?:Guide|Estimate)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i) ||
    extract(text, /Estimated?\s*Value[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i);

  // Name fields
  const cardName: string | undefined =
    extract(text, />\s*Card\s*Name\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,120})\s*</i) ||
    extract(text, />\s*Player\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,120})\s*</i) ||
    player;

  // Game/Sport with enhanced detection
  const game: string | undefined =
    extract(
      text,
      />\s*(?:Sport|Game|Category)\s*<[^>]*>[\s\S]*?<[^>]*>\s*([^<]{1,80})\s*</i
    ) || extract(text, /(?:Sport|Game|Category):\s*([A-Za-z][A-Za-z0-9\s\-\/&]+)/i) ||
    extract(text, /Brand\/?\s*Title[^>]*>[\s\S]*?([A-Za-z]+(?:\s+[A-Za-z]+)*)/i);

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
