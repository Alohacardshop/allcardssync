import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { log } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Get Firecrawl API key
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      log.error('Missing FIRECRAWL_API_KEY environment variable');
      return new Response(
        JSON.stringify({ ok: false, error: 'Firecrawl API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let certNumber: string | null = null;

    // Parse certificate number from request
    if (req.method === 'POST') {
      const body = await req.json();
      certNumber = body.certNumber;
      log.info('CGC lookup via POST', { certNumber });
    } else if (req.method === 'GET') {
      const url = new URL(req.url);
      const pathname = url.pathname;
      
      // Support legacy path format: /ccg/cards/cert/{certNumber}
      const certMatch = pathname.match(/\/ccg\/cards\/cert\/([^\/]+)$/);
      if (certMatch) {
        certNumber = decodeURIComponent(certMatch[1]);
        log.info('CGC lookup via GET (legacy path)', { certNumber, pathname });
      } else {
        log.error('Invalid GET request path', { pathname });
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid request path. Use POST with certNumber in body.' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    if (!certNumber) {
      log.error('Missing certificate number');
      return new Response(
        JSON.stringify({ ok: false, error: 'Certificate number is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Scrape CGC cards website
    const cgcUrl = `https://www.cgccards.com/certlookup/${certNumber}/`;
    log.info('Starting Firecrawl scrape', { cgcUrl, certNumber });

    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: cgcUrl,
        formats: ['markdown', 'html'],
        timeout: 15000,
      }),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      log.error('Firecrawl API error', { 
        status: firecrawlResponse.status, 
        error: errorText,
        certNumber 
      });
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Firecrawl scraping failed: ${firecrawlResponse.status}` 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const firecrawlData = await firecrawlResponse.json();
    const scrapeDuration = Date.now() - startTime;
    log.info('Firecrawl scrape completed', { 
      certNumber, 
      scrapeDuration,
      hasMarkdown: !!firecrawlData.data?.markdown,
      hasHtml: !!firecrawlData.data?.html 
    });

    if (!firecrawlData.success || !firecrawlData.data) {
      log.error('Firecrawl returned no data', { certNumber, firecrawlData });
      return new Response(
        JSON.stringify({ ok: false, error: 'No data found for certificate number' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse the scraped content
    const markdown = firecrawlData.data.markdown || '';
    const html = firecrawlData.data.html || '';
    
    // Extract card information using regex patterns (tolerant parsing)
    const extractField = (pattern: RegExp, content: string): string | null => {
      const match = content.match(pattern);
      return match ? match[1].trim() : null;
    };

    // Parse card details from markdown/HTML content
    const cardName = extractField(/(?:Card Name|Title|Name):\s*([^\n\r]+)/i, markdown) ||
                    extractField(/<h[1-6][^>]*>\s*([^<]+)\s*<\/h[1-6]>/i, html);
    
    const grade = extractField(/(?:Grade|Overall Grade):\s*([^\n\r]+)/i, markdown) ||
                 extractField(/grade[^>]*>\s*([^<]+)/i, html);
    
    const setName = extractField(/(?:Set|Series):\s*([^\n\r]+)/i, markdown);
    const cardNumber = extractField(/(?:Card #|Card Number|Number):\s*([^\n\r]+)/i, markdown);
    const year = extractField(/(?:Year|Date):\s*([^\n\r]+)/i, markdown);
    const rarity = extractField(/(?:Rarity):\s*([^\n\r]+)/i, markdown);

    // Extract images from HTML
    const imageMatches = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
    const images: { frontUrl?: string; frontThumbnailUrl?: string } = {};
    
    for (const imgMatch of imageMatches) {
      const srcMatch = imgMatch.match(/src=["']([^"']+)["']/);
      if (srcMatch && srcMatch[1].includes('cgccards.com')) {
        if (!images.frontUrl) {
          images.frontUrl = srcMatch[1];
          images.frontThumbnailUrl = srcMatch[1]; // Use same image for thumbnail
        }
      }
    }

    // Extract barcode if present
    const barcode = extractField(/(?:Barcode|Bar Code):\s*([^\n\r]+)/i, markdown);

    // Construct CgcCard object
    const cgcCard = {
      certNumber: certNumber,
      grade: {
        displayGrade: grade || 'Unknown'
      },
      collectible: {
        cardName: cardName || 'Unknown Card',
        cardNumber: cardNumber || null,
        cardYear: year || null,
        setName: setName || null,
        rarity: rarity || null,
        language: 'English' // Default assumption
      },
      images: Object.keys(images).length > 0 ? images : undefined,
      metadata: {
        barcode: barcode || null,
        gradedDate: null,
        encapsulationDate: null,
        submissionNumber: null
      }
    };

    const totalDuration = Date.now() - startTime;
    log.info('CGC lookup completed successfully', { 
      certNumber, 
      totalDuration,
      extractedFields: {
        cardName: !!cardName,
        grade: !!grade,
        setName: !!setName,
        cardNumber: !!cardNumber,
        hasImages: Object.keys(images).length > 0
      }
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        data: cgcCard 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('CGC lookup failed with exception', { 
      error: error.message, 
      stack: error.stack,
      totalDuration 
    });
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: `Scraping failed: ${error.message}` 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});