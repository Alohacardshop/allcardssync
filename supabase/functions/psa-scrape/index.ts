import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { log } from "../_shared/log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PSAApiCardResponse {
  ID: number;
  CertNumber: string;
  Year?: string;
  Brand?: string;
  Subject?: string;
  SpecNumber?: string;
  CategoryName?: string;
  GradeNumeric?: number;
  GradeDisplay?: string;
  LabelType?: string;
  VarietyPedigree?: string;
}

interface PSAApiImageResponse {
  CertNumber: string;
  ImageUrls: string[];
}

interface NormalizedResult {
  ok: boolean;
  source: "psa_api" | "scrape";
  url: string;
  certNumber: string;
  grade?: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  cardNumber?: string;
  varietyPedigree?: string;
  labelType?: string;
  specNumber?: string;
  categoryName?: string;
  imageUrl?: string | null;
  imageUrls: string[];
  apiSuccess: boolean;
  scrapeSuccess: boolean;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.info('PSA scrape request received', { method: req.method });

    // Parse and validate request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      log.error('Invalid JSON in request body', { error: error.message });
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid JSON in request body' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log.info('Request body parsed', { body: requestBody });

    // Validate cert parameter
    const { cert } = requestBody;
    if (!cert) {
      log.error('Missing cert parameter');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid cert parameter' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Coerce to string and validate format
    const certStr = String(cert).trim();
    if (!/^\d{5,}$/.test(certStr)) {
      log.error('Invalid cert format', { cert: certStr });
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid cert parameter' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log.info('Processing PSA certificate', { cert: certStr });

    const psaUrl = `https://www.psacard.com/cert/${certStr}/psa`;
    let apiSuccess = false;
    let scrapeSuccess = false;
    let finalSource: "psa_api" | "scrape" = "scrape";

    // Initialize result structure
    let result: Partial<NormalizedResult> = {
      certNumber: certStr,
      imageUrls: [],
      apiSuccess: false,
      scrapeSuccess: false
    };

    // Step 1: Try PSA API first
    log.info('Attempting PSA API fetch');
    
    try {
      // Get PSA API token from system settings
      const tokenResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-system-setting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          keyName: 'PSA_PUBLIC_API_TOKEN',
          fallbackSecretName: 'PSA_PUBLIC_API_TOKEN'
        })
      });

      let psaToken = null;
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        psaToken = tokenData.value;
        log.info('PSA API token retrieved');
      } else {
        log.warn('PSA API token not found, skipping API');
      }

      if (psaToken) {
        // Fetch card data and images in parallel
        const [cardResponse, imageResponse] = await Promise.all([
          fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${certStr}`, {
            headers: { 'Authorization': `Bearer ${psaToken}` }
          }),
          fetch(`https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${certStr}`, {
            headers: { 'Authorization': `Bearer ${psaToken}` }
          })
        ]);

        if (cardResponse.ok) {
          const cardData: PSAApiCardResponse = await cardResponse.json();
          log.info('PSA API card data retrieved', { cert: certStr, hasData: !!cardData });

          // Normalize PSA API data
          result.grade = cardData.GradeDisplay || (cardData.GradeNumeric ? String(cardData.GradeNumeric) : undefined);
          result.year = cardData.Year;
          result.brandTitle = cardData.Brand;
          result.subject = cardData.Subject;
          result.cardNumber = cardData.SpecNumber;
          result.varietyPedigree = cardData.VarietyPedigree;
          result.labelType = cardData.LabelType;
          result.specNumber = cardData.SpecNumber;
          result.categoryName = cardData.CategoryName;

          apiSuccess = true;
          log.info('PSA API data normalized', { fields: Object.keys(result).filter(k => result[k]) });
        }

        if (imageResponse.ok) {
          const imageData: PSAApiImageResponse = await imageResponse.json();
          if (imageData.ImageUrls?.length > 0) {
            result.imageUrls = imageData.ImageUrls;
            result.imageUrl = imageData.ImageUrls[0];
            log.info('PSA API images retrieved', { count: imageData.ImageUrls.length });
          }
        }

        // Check if we got substantial data from PSA API
        const hasSubstantialData = !!(result.grade || result.brandTitle || result.subject);
        if (hasSubstantialData) {
          finalSource = "psa_api";
          log.info('PSA API provided substantial data, using as primary source');
        }
      }
    } catch (error) {
      log.error('PSA API error', { error: error.message });
    }

    // Step 2: Firecrawl fallback (if PSA API didn't provide complete data)
    if (!apiSuccess || !result.grade || !result.brandTitle) {
      log.info('Falling back to Firecrawl scraping');

      try {
        // Get Firecrawl API key
        const firecrawlResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-system-setting`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            keyName: 'FIRECRAWL_API_KEY',
            fallbackSecretName: 'FIRECRAWL_API_KEY'
          })
        });

        let firecrawlApiKey = null;
        if (firecrawlResponse.ok) {
          const firecrawlData = await firecrawlResponse.json();
          firecrawlApiKey = firecrawlData.value;
          log.info('Firecrawl API key retrieved');
        } else {
          log.error('Firecrawl API key not found');
          throw new Error('Firecrawl API key not configured');
        }

        // Scrape PSA page
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: psaUrl,
            formats: ["html", "markdown"]
          })
        });

        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json();
          log.info('Firecrawl response received', { 
            hasData: !!scrapeData.data,
            hasHtml: !!(scrapeData.data?.html || scrapeData.html),
            hasMarkdown: !!(scrapeData.data?.markdown || scrapeData.markdown)
          });

          // Extract HTML content (handle both response formats)
          const html = scrapeData.data?.html || scrapeData.html || '';
          const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';

          if (html || markdown) {
            const content = html || markdown;
            
            // Parse HTML/markdown for PSA data
            const extractedData = extractPSAData(content, certStr);
            
            // Fill in missing fields from scraping
            if (extractedData.grade && !result.grade) result.grade = extractedData.grade;
            if (extractedData.year && !result.year) result.year = extractedData.year;
            if (extractedData.brandTitle && !result.brandTitle) result.brandTitle = extractedData.brandTitle;
            if (extractedData.subject && !result.subject) result.subject = extractedData.subject;
            if (extractedData.cardNumber && !result.cardNumber) result.cardNumber = extractedData.cardNumber;
            if (extractedData.varietyPedigree && !result.varietyPedigree) result.varietyPedigree = extractedData.varietyPedigree;
            if (extractedData.labelType && !result.labelType) result.labelType = extractedData.labelType;
            if (extractedData.categoryName && !result.categoryName) result.categoryName = extractedData.categoryName;

            // Images from scraping (if not already from API)
            if (extractedData.imageUrls.length > 0 && result.imageUrls.length === 0) {
              result.imageUrls = extractedData.imageUrls;
              result.imageUrl = extractedData.imageUrls[0];
            }

            scrapeSuccess = true;
            
            // If scraping filled significant missing data, update source
            if (!apiSuccess || extractedData.grade || extractedData.brandTitle) {
              finalSource = "scrape";
            }

            log.info('Firecrawl data extracted and merged', { 
              extractedFields: Object.keys(extractedData).filter(k => extractedData[k]) 
            });
          }
        } else {
          log.error('Firecrawl API error', { status: scrapeResponse.status });
        }
      } catch (error) {
        log.error('Firecrawl scraping failed', { error: error.message });
      }
    }

    // Build final response
    const finalResult: NormalizedResult = {
      ok: true,
      source: finalSource,
      url: psaUrl,
      certNumber: certStr,
      grade: result.grade,
      year: result.year,
      brandTitle: result.brandTitle,
      subject: result.subject,
      cardNumber: result.cardNumber,
      varietyPedigree: result.varietyPedigree,
      labelType: result.labelType,
      specNumber: result.specNumber,
      categoryName: result.categoryName,
      imageUrl: result.imageUrl || null,
      imageUrls: result.imageUrls || [],
      apiSuccess,
      scrapeSuccess
    };

    log.info('PSA scrape completed successfully', { 
      cert: certStr, 
      source: finalSource, 
      apiSuccess, 
      scrapeSuccess,
      hasGrade: !!finalResult.grade,
      hasBrandTitle: !!finalResult.brandTitle,
      hasSubject: !!finalResult.subject,
      imageCount: finalResult.imageUrls.length
    });

    return new Response(
      JSON.stringify(finalResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    log.error('Unexpected error in PSA scrape', { error: error.message, stack: error.stack });
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: 'An unexpected error occurred while processing the PSA certificate' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to extract PSA data from HTML/markdown content
function extractPSAData(content: string, certNumber: string) {
  const result = {
    grade: '',
    year: '',
    brandTitle: '',
    subject: '',
    cardNumber: '',
    varietyPedigree: '',
    labelType: '',
    categoryName: '',
    imageUrls: []
  };

  try {
    // Extract Item Grade
    const gradeMatch = content.match(/(?:Item Grade|Grade)[:\s]*([^\n\r<]+)/i);
    if (gradeMatch) {
      result.grade = gradeMatch[1].trim().replace(/[<>]/g, '');
    }

    // Extract Year
    const yearMatch = content.match(/(?:Year)[:\s]*(\d{4})/i);
    if (yearMatch) {
      result.year = yearMatch[1];
    }

    // Extract Brand/Title
    const brandMatch = content.match(/(?:Brand\/Title|Brand|Title)[:\s]*([^\n\r<]+)/i);
    if (brandMatch) {
      result.brandTitle = brandMatch[1].trim().replace(/[<>]/g, '');
    }

    // Extract Subject
    const subjectMatch = content.match(/(?:Subject)[:\s]*([^\n\r<]+)/i);
    if (subjectMatch) {
      result.subject = subjectMatch[1].trim().replace(/[<>]/g, '');
    }

    // Extract Card Number
    const cardNumMatch = content.match(/(?:Card Number)[:\s]*([^\n\r<]+)/i);
    if (cardNumMatch) {
      result.cardNumber = cardNumMatch[1].trim().replace(/[<>]/g, '');
    }

    // Extract Variety/Pedigree
    const varietyMatch = content.match(/(?:Variety\/Pedigree|Variety|Pedigree)[:\s]*([^\n\r<]+)/i);
    if (varietyMatch) {
      result.varietyPedigree = varietyMatch[1].trim().replace(/[<>]/g, '');
    }

    // Extract Label Type
    const labelMatch = content.match(/(?:Label Type)[:\s]*([^\n\r<]+)/i);
    if (labelMatch) {
      result.labelType = labelMatch[1].trim().replace(/[<>]/g, '');
    }

    // Extract Category
    const categoryMatch = content.match(/(?:Category)[:\s]*([^\n\r<]+)/i);
    if (categoryMatch) {
      result.categoryName = categoryMatch[1].trim().replace(/[<>]/g, '');
    }

    // Extract images
    const imageUrls: string[] = [];
    
    // Look for og:image
    const ogImageMatch = content.match(/property="og:image"\s+content="([^"]+)"/i);
    if (ogImageMatch) {
      imageUrls.push(ogImageMatch[1]);
    }

    // Look for card images in img tags
    const imgMatches = content.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi);
    for (const match of imgMatches) {
      const src = match[1];
      if (src.includes('http') && (
        src.includes('cloudfront') || 
        src.includes('psacard') ||
        src.includes('card') ||
        src.toLowerCase().includes('cert')
      )) {
        imageUrls.push(src);
      }
    }

    result.imageUrls = [...new Set(imageUrls)]; // Remove duplicates

  } catch (error) {
    log.error('Error extracting PSA data from content', { error: error.message });
  }

  return result;
}