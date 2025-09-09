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

    // Desktop CGC URL with trailing slash to avoid redirects
    const targetUrl = `https://www.cgccards.com/certlookup/${certNumber}/`;
    console.log('[CGC-LOOKUP] Target URL:', targetUrl);

    // Create AbortController for 18s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 18000);

    let html = '';
    let usedMethod = 'firecrawl';
    let firecrawlMs = 0;

    // Try Firecrawl first if API key is available
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    console.log('[CGC-LOOKUP] FIRECRAWL_API_KEY present:', !!firecrawlApiKey);
    
    if (firecrawlApiKey) {
      try {
        const firecrawlStartTime = Date.now();
        const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: targetUrl,
            formats: ['extract', 'html'],
            timeout: 18000,
            waitFor: 2000,
            proxy: { mode: 'basic' }
          }),
          signal: controller.signal
        });
        
        firecrawlMs = Date.now() - firecrawlStartTime;
        
        if (firecrawlResponse.ok) {
          const firecrawlData = await firecrawlResponse.json();
          if (firecrawlData.success && firecrawlData.data?.html) {
            html = firecrawlData.data.html;
            
            // Log structured diagnostics with HTML snippet
            console.log(JSON.stringify({
              tag: "cgc-scrape",
              certNumber,
              firecrawlStatus: firecrawlResponse.status,
              firecrawlMs,
              htmlSnippet: (html ?? "").slice(0, 600).replace(/\s+/g," ").trim()
            }));
            
            // Check if we got valid CGC content
            const hasValidContent = html.includes("Verify CGC-certified Cards") || html.includes("Cert #");
            if (!hasValidContent) {
              console.log('[CGC-LOOKUP] Firecrawl returned invalid content, falling back to direct fetch');
              html = ''; // Clear to trigger fallback
            }
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          clearTimeout(timeoutId);
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: 'CGC lookup timed out',
              diagnostics: { timeoutMs: 18000, totalMs: Date.now() - startTime }
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
        console.log('[CGC-LOOKUP] Firecrawl failed:', error.message);
      }
    }

    // Direct fetch fallback if Firecrawl failed or returned bad content
    if (!html) {
      try {
        console.log('[CGC-LOOKUP] Using direct fetch fallback');
        const directStartTime = Date.now();
        
        const res = await fetch(targetUrl, {
          headers: { 
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
          },
          redirect: "follow",
          signal: controller.signal
        });
        
        const directMs = Date.now() - directStartTime;
        html = await res.text();
        usedMethod = 'direct';
        
        console.log(JSON.stringify({
          tag: "cgc-direct-fallback", 
          status: res.status, 
          len: html.length,
          directMs
        }));
        
        // Check for 404 or "not found" content
        if (res.status === 404 || html.includes("No certification found")) {
          clearTimeout(timeoutId);
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: 'CGC: certificate not found',
              diagnostics: { status: res.status, totalMs: Date.now() - startTime }
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          clearTimeout(timeoutId);
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: 'CGC lookup timed out',
              diagnostics: { timeoutMs: 18000, totalMs: Date.now() - startTime }
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
        throw error;
      }
    }
    
    clearTimeout(timeoutId);

    // Deterministic HTML parsing using label->value extraction
    const txt = html.replace(/<[^>]+>/g,"|").replace(/\s+/g," ").trim();
    
    const rx = (label: string) => new RegExp(label + "\\s*\\|?\\s*([^|]+)", "i");
    const get = (label: string) => (txt.match(rx(label))?.[1] ?? "").trim();

    const out = {
      certNumber: get("Cert #") || certNumber.toString(),
      grade: { displayGrade: get("Grade") },
      collectible: {
        cardName: get("Card Name"),
        setName: get("Card Set"),
        cardNumber: get("Card Number"),
        cardYear: get("Year"),
        game: get("Game"),
        language: get("Language") || "English",
        makerName: "",
        rarity: get("Rarity") || ""
      },
      images: { 
        frontUrl: html.match(/property=["']og:image["'] content=["']([^"']+)/i)?.[1] ?? ""
      },
      metadata: {
        gradedDate: null,
        encapsulationDate: null,
        submissionNumber: null,
        barcode: null
      }
    };

    // Check if we got essential fields
    if (!out.certNumber || !out.collectible.cardName) {
      const debugSnippet = txt.slice(0, 200);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'CGC page parsed but fields missing',
          diagnostics: { 
            debugSnippet,
            usedMethod,
            firecrawlMs,
            totalMs: Date.now() - startTime 
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Normalize output to match UI expectations
    out.grade.displayGrade = out.grade.displayGrade.replace(/^\s*GEM MINT\s*/i,"GEM MINT ").trim();
    if (/^\d{4}$/.test(out.collectible.cardYear)) {
      out.collectible.cardYear = String(out.collectible.cardYear);
    }
    out.collectible.cardName = out.collectible.cardName.replace(/\s+/g," ").trim();

    const totalMs = Date.now() - startTime;
    console.log('[CGC-LOOKUP] Parse summary:', { 
      certNumber,
      cardName: !!out.collectible.cardName,
      grade: !!out.grade.displayGrade,
      setName: !!out.collectible.setName,
      hasImage: !!out.images?.frontUrl,
      usedMethod,
      totalMs,
      firecrawlMs
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        data: out,
        source: 'cgc_scrape',
        diagnostics: { 
          used: usedMethod,
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