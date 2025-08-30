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
  console.log("HTML length:", html.length);
  console.log("HTML sample:", html.substring(0, 1000));

  // Extract fields from the "Item Information" section table structure
  const extractTableField = (fieldName: string): string | undefined => {
    // Try multiple patterns for table-based extraction
    const patterns = [
      new RegExp(`${fieldName}[^>]*>\\s*([^<\\n]+)`, 'i'),
      new RegExp(`<td[^>]*>\\s*${fieldName}\\s*</td>\\s*<td[^>]*>\\s*([^<]+)`, 'i'),
      new RegExp(`${fieldName}\\s*</(?:td|th)>\\s*<(?:td|th)[^>]*>\\s*([^<]+)`, 'i'),
      new RegExp(`${fieldName}\\s+([^\\n<]+)`, 'i')
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value && value !== fieldName) {
          console.log(`Found ${fieldName}:`, value);
          return value;
        }
      }
    }
    return undefined;
  };

  // Extract main fields from PSA page
  const certNumber = extractTableField('Cert Number') || cert;
  const grade = extractTableField('Item Grade') || extractTableField('Grade');
  const year = extractTableField('Year');
  const brandTitle = extractTableField('Brand/Title') || extractTableField('Brand');
  const subject = extractTableField('Subject');
  const cardNumber = extractTableField('Card Number');
  const category = extractTableField('Category');
  const varietyPedigree = extractTableField('Variety/Pedigree') || extractTableField('Variety');
  
  // Extract PSA Estimate
  const psaEstimate = extractTableField('PSA Estimate') || 
    extractValue(html, /PSA Estimate\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i);

  // Extract label type
  const labelType = extractTableField('Label Type');
  
  // Extract reverse cert/barcode
  const reverseCert = extractTableField('Reverse Cert/Barcode');

  // Also try to extract from the main card title/description at the top
  const titleMatch = html.match(/#(\d+)\s*([^<\n]+?)(?:\s*<|$)/);
  let fullDescription = '';
  if (titleMatch) {
    fullDescription = titleMatch[2]?.trim() || '';
    console.log("Found title description:", fullDescription);
  }

  // Parse additional info from description if fields are missing
  let parsedYear, parsedBrand, parsedCardName, parsedCardNumber, parsedRarity;
  
  if (fullDescription) {
    // Extract year (4 digits at start)
    const yearMatch = fullDescription.match(/^(\d{4})\s+/);
    if (yearMatch) parsedYear = yearMatch[1];
    
    // Extract card number (# followed by alphanumeric)
    const numberMatch = fullDescription.match(/#(\w+)/);
    if (numberMatch) parsedCardNumber = numberMatch[1];
    
    // Extract rarity/variety (words at the end)
    const rarityMatch = fullDescription.match(/\s+((?:ART\s+)?(?:RARE|HOLO|COMMON|UNCOMMON|PROMO|ULTRA\s+RARE|SECRET\s+RARE).*?)$/i);
    if (rarityMatch) parsedRarity = rarityMatch[1].trim();
    
    // Extract card name and brand
    let workingDesc = fullDescription;
    if (yearMatch) workingDesc = workingDesc.replace(yearMatch[0], '').trim();
    if (numberMatch) workingDesc = workingDesc.replace(numberMatch[0], '').trim();
    if (rarityMatch) workingDesc = workingDesc.replace(rarityMatch[0], '').trim();
    
    const parts = workingDesc.split(' ');
    if (parts.length >= 2) {
      parsedCardName = parts[parts.length - 1];
      parsedBrand = parts.slice(0, -1).join(' ');
    }
  }

  // Use extracted values with fallbacks
  const finalYear = year || parsedYear;
  const finalBrand = brandTitle || parsedBrand;
  const finalSubject = subject || parsedCardName;
  const finalCardNumber = cardNumber || parsedCardNumber;
  const finalVariety = varietyPedigree || parsedRarity;

  // Build title
  const titleParts = [finalYear, finalBrand, finalSubject].filter(Boolean);
  const title = titleParts.length > 0 ? titleParts.join(" ") : fullDescription || `PSA Cert ${cert}`;

  // Normalize game from category
  let game = (category || '').toLowerCase();
  if (game.includes('tcg')) game = 'pokemon'; // TCG CARDS typically means Pokemon
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
    certNumber: String(certNumber || cert),
    title,
    cardName: finalSubject,
    year: finalYear,
    game: game || 'tcg',
    cardNumber: finalCardNumber,
    grade: normalizedGrade,
    gradeNumeric,
    gradeDisplay: grade,
    category,
    brandTitle: finalBrand,
    subject: finalSubject,
    varietyPedigree: finalVariety,
    labelType,
    reverseCert,
    psaEstimate,
    // Legacy compatibility
    player: finalSubject,
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

    console.log("Making Firecrawl structured extraction request...");
    
    // Enhanced Firecrawl request with structured extraction
    const firecrawlConfig = {
      url: psaUrl,
      formats: ["extract"],
      extract: {
        schema: {
          type: "object",
          required: ["certification_number"],
          properties: {
            certification_number: { type: "string" },
            cert_number: { type: "string" },
            item_grade: { type: "string" },
            label_type: { type: "string" },
            reverse_cert_barcode: { type: "string" },
            year: { type: "string" },
            brand_title: { type: "string" },
            subject: { type: "string" },
            card_number: { type: "string" },
            category: { type: "string" },
            variety_pedigree: { type: "string" },
            psa_estimate: { type: "string" },
            image_url: { type: "string", format: "uri" }
          }
        },
        instructions: "Extract PSA certification data from the page. Clean and normalize all values. For certification_number, extract digits only. For year, extract the 4-digit year. For grades, keep exact text like 'GEM MT 10'. For image_url, prefer the main card image.",
        selectors: {
          certification_number: "//*[self::th or self::div][contains(normalize-space(.), 'Cert Number')]/following::*[self::td or self::div or self::span][1] | //*[contains(@class,'cert') and contains(@class,'number')][1]",
          cert_number: "//*[self::th or self::div][contains(normalize-space(.), 'Cert Number')]/following::*[self::td or self::div or self::span][1]",
          item_grade: "//*[self::th or self::div][contains(normalize-space(.), 'Item Grade')]/following::*[self::td or self::div or self::span][1]",
          label_type: "//*[self::th or self::div][contains(normalize-space(.), 'Label Type')]/following::*[self::td or self::div or self::span][1]",
          reverse_cert_barcode: "//*[self::th or self::div][contains(normalize-space(.), 'Reverse Cert/Barcode')]/following::*[self::td or self::div or self::span][1]",
          year: "//*[self::th or self::div][contains(normalize-space(.), 'Year')]/following::*[self::td or self::div or self::span][1]",
          brand_title: "//*[self::th or self::div][contains(normalize-space(.), 'Brand/Title')]/following::*[self::td or self::div or self::span][1]",
          subject: "//*[self::th or self::div][contains(normalize-space(.), 'Subject')]/following::*[self::td or self::div or self::span][1]",
          card_number: "//*[self::th or self::div][contains(normalize-space(.), 'Card Number')]/following::*[self::td or self::div or self::span][1]",
          category: "//*[self::th or self::div][contains(normalize-space(.), 'Category')]/following::*[self::td or self::div or self::span][1]",
          variety_pedigree: "//*[self::th or self::div][contains(normalize-space(.), 'Variety/Pedigree')]/following::*[self::td or self::div or self::span][1]",
          psa_estimate: "//*[self::th or self::div][contains(normalize-space(.), 'PSA Estimate')]/following::*[self::td or self::div or self::span][1]",
          image_url: "((//meta[translate(@property,'OGIMAE','ogimae')='og:image']/@content)[1] | (//picture//img[contains(@src,'http')][1]/@src) | (//img[contains(@src,'http') and (contains(@alt,'card') or contains(@class,'card') or contains(@class,'product') or contains(@class,'main'))][1]/@src))[1]"
        }
      },
      timeout: 15000,
      waitFor: 3000
    };

    // Make Firecrawl request with timeout
    const scrapeResponse = await Promise.race([
      fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(firecrawlConfig),
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Firecrawl request timeout after 20 seconds")), 20000)
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
    
    // Get structured data from Firecrawl
    const extractData = scrapeData?.data?.extract;
    const html = scrapeData?.data?.html || "";
    
    console.log("Firecrawl extracted data:", JSON.stringify(extractData, null, 2));

    let cardData;
    let imageUrl = null;

    if (extractData && Object.keys(extractData).length > 0) {
      // Use Firecrawl structured extraction
      console.log("Using Firecrawl structured extraction");
      
      // Clean and normalize the extracted data
      const cleanValue = (value: any): string | undefined => {
        if (!value || typeof value !== 'string') return undefined;
        return value.trim() || undefined;
      };

      const certNumber = cleanValue(extractData.certification_number) || cleanValue(extractData.cert_number) || cert;
      const grade = cleanValue(extractData.item_grade);
      const year = cleanValue(extractData.year);
      const brandTitle = cleanValue(extractData.brand_title);
      const subject = cleanValue(extractData.subject);
      const cardNumber = cleanValue(extractData.card_number);
      const category = cleanValue(extractData.category);
      const varietyPedigree = cleanValue(extractData.variety_pedigree);
      const labelType = cleanValue(extractData.label_type);
      const reverseCert = cleanValue(extractData.reverse_cert_barcode);
      const psaEstimate = cleanValue(extractData.psa_estimate);
      
      imageUrl = cleanValue(extractData.image_url);

      // Build title from available components
      const titleParts = [year, brandTitle, subject].filter(Boolean);
      const title = titleParts.length > 0 ? titleParts.join(" ") : `PSA Cert ${cert}`;

      // Normalize game from category
      let game = (category || '').toLowerCase();
      if (game.includes('tcg')) game = 'pokemon';
      if (game.includes('pokemon')) game = 'pokemon';
      if (game.includes('magic') || game.includes('mtg')) game = 'mtg';
      if (game.includes('baseball')) game = 'baseball';
      if (game.includes('football')) game = 'football';
      if (game.includes('basketball')) game = 'basketball';

      // Parse grade numeric value
      let gradeNumeric = null;
      let normalizedGrade = grade;
      if (grade) {
        const numMatch = grade.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) {
          gradeNumeric = parseFloat(numMatch[1]);
          normalizedGrade = `PSA ${gradeNumeric}`;
        }
      }

      cardData = {
        cert: String(cert),
        certNumber: String(certNumber),
        title,
        cardName: subject,
        year,
        game: game || 'tcg',
        cardNumber,
        grade: normalizedGrade,
        gradeNumeric,
        gradeDisplay: grade,
        category,
        brandTitle,
        subject,
        varietyPedigree,
        labelType,
        reverseCert,
        psaEstimate,
        // Legacy compatibility
        player: subject,
        set: brandTitle,
      };

    } else if (html) {
      // Fallback to HTML parsing
      console.log("Falling back to HTML parsing");
      cardData = extractCardData(html, cert);
      imageUrl = extractImage(html);
    } else {
      console.error("No structured data or HTML content received from Firecrawl");
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "No data received from PSA page scraping" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrls = imageUrl ? [imageUrl] : [];

    const result = {
      ok: true,
      url: psaUrl,
      ...cardData,
      imageUrl,
      imageUrls,
      source: 'firecrawl_structured',
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

