import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { log } from "../_shared/log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NormalizedResult {
  ok: boolean;
  source: "scrape";
  url: string;
  certNumber: string;
  grade?: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  cardNumber?: string;
  varietyPedigree?: string;
  labelType?: string;
  categoryName?: string;
  imageUrl?: string | null;
  imageUrls: string[];
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

    // Initialize result structure
    let result: Partial<NormalizedResult> = {
      certNumber: certStr,
      imageUrls: []
    };

    // Get Firecrawl API key
    log.info('Getting Firecrawl API key for scraping');
    
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
      return new Response(
        JSON.stringify({ ok: false, error: 'Firecrawl API key not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scrape PSA page with Firecrawl
    log.info('Scraping PSA page with Firecrawl', { url: psaUrl });
    
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

    if (!scrapeResponse.ok) {
      log.error('Firecrawl API error', { status: scrapeResponse.status });
      return new Response(
        JSON.stringify({ ok: false, error: `Firecrawl request failed: ${scrapeResponse.status}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapeData = await scrapeResponse.json();
    log.info('Firecrawl response received', { 
      hasData: !!scrapeData.data,
      hasHtml: !!(scrapeData.data?.html || scrapeData.html || scrapeData.data?.content),
      hasMarkdown: !!(scrapeData.data?.markdown || scrapeData.markdown)
    });

    // Extract HTML content (handle multiple response formats)
    const html = scrapeData.data?.html || scrapeData.html || scrapeData.data?.content || '';
    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';

    if (!html && !markdown) {
      log.error('No content received from Firecrawl');
      return new Response(
        JSON.stringify({ ok: false, error: 'No data received from PSA page scraping' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = html || markdown;
    
    // Parse HTML/markdown for PSA data
    const extractedData = extractPSAData(content, certStr);
    
    // Fill in fields from scraping
    result.grade = extractedData.grade;
    result.year = extractedData.year;
    result.brandTitle = extractedData.brandTitle;
    result.subject = extractedData.subject;
    result.cardNumber = extractedData.cardNumber;
    result.varietyPedigree = extractedData.varietyPedigree;
    result.labelType = extractedData.labelType;
    result.categoryName = extractedData.categoryName;

    // Images from scraping
    if (extractedData.imageUrls.length > 0) {
      result.imageUrls = extractedData.imageUrls;
      result.imageUrl = extractedData.imageUrls[0];
    }

    log.info('PSA data extracted via Firecrawl', { 
      extractedFields: Object.keys(extractedData).filter(k => extractedData[k]) 
    });

    // Build final response
    const finalResult: NormalizedResult = {
      ok: true,
      source: "scrape",
      url: psaUrl,
      certNumber: certStr,
      grade: result.grade,
      year: result.year,
      brandTitle: result.brandTitle,
      subject: result.subject,
      cardNumber: result.cardNumber,
      varietyPedigree: result.varietyPedigree,
      labelType: result.labelType,
      categoryName: result.categoryName,
      imageUrl: result.imageUrl || null,
      imageUrls: result.imageUrls || []
    };

    log.info('PSA scrape completed successfully via Firecrawl', { 
      cert: certStr, 
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