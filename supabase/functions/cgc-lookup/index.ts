import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Only POST method is supported' }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const startTime = Date.now();
  
  try {
    const body = await req.json();
    console.log('[CGC-LOOKUP] Request received:', { mode: body.mode, certNumber: body.certNumber });

    // Fast ping mode
    if (body.mode === 'ping') {
      console.log('[CGC-LOOKUP] Ping mode activated');
      return new Response(
        JSON.stringify({ ok: true, message: 'cgc-lookup reachable' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Firecrawl API key
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    console.log('[CGC-LOOKUP] FIRECRAWL_API_KEY present:', !!firecrawlApiKey);
    
    if (!firecrawlApiKey) {
      console.log('[CGC-LOOKUP] Missing FIRECRAWL_API_KEY environment variable');
      return new Response(
        JSON.stringify({ ok: false, error: 'FIRECRAWL_API_KEY not configured' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { certNumber } = body;
    
    if (!certNumber || !/^\d{5,}$/.test(certNumber.toString())) {
      console.log('[CGC-LOOKUP] Invalid cert number:', certNumber);
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing or invalid cert number (digits only, 5+ chars required)' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Scrape CGC cards website with timeout
    const cgcUrl = `https://www.cgccards.com/certlookup/${certNumber}/`;
    console.log('[CGC-LOOKUP] Starting Firecrawl scrape:', cgcUrl);

    const firecrawlStartTime = Date.now();
    
    // Create AbortController for 18s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 18000);

    let firecrawlResponse;
    try {
      firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: cgcUrl,
          formats: ['extract', 'html'],
          timeout: 18000,
          waitFor: 2000,
          proxy: { mode: 'basic' }
        }),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.log('[CGC-LOOKUP] Firecrawl request timed out');
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: 'CGC lookup timed out after 18 seconds',
            diagnostics: { totalMs: Date.now() - startTime, firecrawlMs: 18000 }
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      throw error;
    }
    
    clearTimeout(timeoutId);
    const firecrawlMs = Date.now() - firecrawlStartTime;

    console.log('[CGC-LOOKUP] Firecrawl response status:', firecrawlResponse.status);

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.log('[CGC-LOOKUP] Firecrawl API error:', firecrawlResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Firecrawl scraping failed: ${firecrawlResponse.status}`,
          diagnostics: { firecrawlStatus: firecrawlResponse.status, firecrawlMs, totalMs: Date.now() - startTime }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const firecrawlData = await firecrawlResponse.json();
    console.log('[CGC-LOOKUP] Firecrawl completed:', { 
      success: firecrawlData.success,
      hasExtract: !!firecrawlData.data?.extract,
      hasHtml: !!firecrawlData.data?.html,
      firecrawlMs 
    });

    if (!firecrawlData.success || !firecrawlData.data) {
      console.log('[CGC-LOOKUP] No data found for cert:', certNumber);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'No data found for certificate number',
          diagnostics: { firecrawlStatus: 'no_data', firecrawlMs, totalMs: Date.now() - startTime }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse the scraped content
    const extract = firecrawlData.data.extract || {};
    const html = firecrawlData.data.html || '';
    
    // Extract card information from structured extract first, fallback to HTML parsing
    let cardName = extract.cardName || extract.title || extract.name;
    let grade = extract.grade || extract.overallGrade;
    let setName = extract.set || extract.series || extract.brandTitle;
    let cardNumber = extract.cardNumber || extract.number;
    let year = extract.year || extract.cardYear;
    let game = extract.game;
    let makerName = extract.maker || extract.manufacturer;
    let language = extract.language;
    let rarity = extract.rarity;

    // Fallback HTML parsing if extract didn't provide data
    const extractFromHtml = (pattern: RegExp): string | null => {
      const match = html.match(pattern);
      return match ? match[1].trim() : null;
    };

    if (!cardName) {
      cardName = extractFromHtml(/<h[1-6][^>]*>\s*([^<]+)\s*<\/h[1-6]>/i) ||
                extractFromHtml(/(?:Card Name|Title|Name):\s*([^\n\r<]+)/i);
    }
    
    if (!grade) {
      grade = extractFromHtml(/(?:Grade|Overall Grade):\s*([^\n\r<]+)/i) ||
              extractFromHtml(/grade[^>]*>\s*([^<]+)/i);
    }

    // Extract images - look for og:image first, then any CGC card images
    let frontUrl = null;
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogImageMatch) {
      frontUrl = ogImageMatch[1];
    } else {
      const imgMatches = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
      for (const imgMatch of imgMatches) {
        const srcMatch = imgMatch.match(/src=["']([^"']+)["']/);
        if (srcMatch && (srcMatch[1].includes('cgccards.com') || srcMatch[1].includes('card'))) {
          frontUrl = srcMatch[1];
          break;
        }
      }
    }

    // Construct CgcCard object
    const cgcCard = {
      certNumber: certNumber.toString(),
      grade: {
        displayGrade: grade || 'Unknown'
      },
      collectible: {
        cardName: cardName || 'Unknown Card',
        cardNumber: cardNumber || null,
        cardYear: year || null,
        game: game || null,
        setName: setName || null,
        makerName: makerName || null,
        language: language || 'English',
        rarity: rarity || null
      },
      images: frontUrl ? { frontUrl } : undefined,
      metadata: {
        gradedDate: null,
        encapsulationDate: null,
        submissionNumber: null,
        barcode: null
      }
    };

    const totalMs = Date.now() - startTime;
    console.log('[CGC-LOOKUP] Parse summary:', { 
      certNumber,
      cardName: !!cardName,
      grade: !!grade,
      setName: !!setName,
      hasImage: !!frontUrl,
      totalMs,
      firecrawlMs
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        data: cgcCard,
        source: 'cgc_scrape',
        diagnostics: { 
          firecrawlStatus: 'success', 
          firecrawlMs, 
          totalMs 
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const totalMs = Date.now() - startTime;
    console.log('[CGC-LOOKUP] Exception:', error.message, { totalMs });
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: `Scraping failed: ${error.message}`,
        diagnostics: { totalMs }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});