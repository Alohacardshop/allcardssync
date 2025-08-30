import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PSACertificateData {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  cardNumber?: string;
  varietyPedigree?: string;
  category?: string;
  imageUrl?: string;
  imageUrls?: string[];
  psaUrl: string;
}

serve(async (req) => {
  const started = Date.now();
  
  console.log('🚀 PSA-SCRAPE-V2 FUNCTION STARTED');
  console.log('📝 Request method:', req.method);
  console.log('🌐 Request URL:', req.url);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    console.log('❌ Invalid method:', req.method);
    return new Response(
      JSON.stringify({ ok: false, error: 'Use POST' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
    console.log('📦 Request body parsed:', JSON.stringify(body));
  } catch (e) {
    console.log('❌ Failed to parse JSON body:', e);
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Ping mode for reachability checks
  if (body?.mode === 'ping') {
    console.log('🏓 Ping request handled');
    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: 'psa-scrape-v2 reachable', 
        diagnostics: { totalMs: Date.now() - started } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const cert = String(body?.cert ?? '').trim();
  console.log('🔍 Certificate number extracted:', cert);

  if (!/^\d{8,9}$/.test(cert)) {
    console.log('❌ Invalid certificate format:', cert);
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid certificate number (must be 8-9 digits)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const psaUrl = `https://www.psacard.com/cert/${cert}/psa`;
  console.log('🌐 PSA URL constructed:', psaUrl);

  // Environment check
  console.log('🔧 Environment check:');
  console.log('- SUPABASE_URL exists:', !!Deno.env.get('SUPABASE_URL'));
  console.log('- SUPABASE_SERVICE_ROLE_KEY exists:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  console.log('- FIRECRAWL_API_KEY exists:', !!Deno.env.get('FIRECRAWL_API_KEY'));

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('📊 Checking database for cached result...');
    // Check if we have a recent cached result (within 24 hours)
    const { data: existingCert, error: cacheError } = await supabase
      .from('psa_certificates')
      .select('*')
      .eq('cert_number', cert)
      .gte('scraped_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 24 hours ago
      .single();

    if (cacheError && cacheError.code !== 'PGRST116') {
      console.log('⚠️ Database cache check error:', cacheError);
    } else if (existingCert) {
      console.log('✅ Found cached result');
      return new Response(
        JSON.stringify({
          ok: true,
          source: 'database_cache',
          url: psaUrl,
          certNumber: existingCert.cert_number,
          isValid: existingCert.is_valid,
          grade: existingCert.grade,
          year: existingCert.year,
          brandTitle: existingCert.brand,
          subject: existingCert.subject,
          cardNumber: existingCert.card_number,
          varietyPedigree: existingCert.variety_pedigree,
          category: existingCert.category,
          imageUrl: existingCert.image_url,
          imageUrls: existingCert.image_urls,
          diagnostics: {
            totalMs: Date.now() - started,
            cached: true,
            cacheAge: Date.now() - new Date(existingCert.scraped_at).getTime()
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log('ℹ️ No cached result found, will scrape fresh');
    }
  } catch (dbInitError) {
    console.log('💥 Database initialization error:', dbInitError);
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Database error: ${dbInitError.message}`,
        diagnostics: { totalMs: Date.now() - started }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get Firecrawl API key
  console.log('🔑 Getting Firecrawl API key...');
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY') ?? '';
  
  if (!apiKey) {
    console.log('❌ FIRECRAWL_API_KEY not configured');
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'FIRECRAWL_API_KEY not configured',
        diagnostics: { hadApiKey: false, totalMs: Date.now() - started }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('✅ Firecrawl API key found (length:', apiKey.length, ')');

  // Firecrawl call with timeout
  console.log('🚀 Starting Firecrawl API call...');
  const requestStart = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    console.log('⏱️ Firecrawl timeout triggered');
    ctrl.abort();
  }, 18000);

  const requestPayload = {
    url: psaUrl,
    formats: ['markdown', 'html'],
    timeout: 18000,
    waitFor: 2000
  };

  console.log('📦 Firecrawl request payload:', JSON.stringify(requestPayload));

  let firecrawlStatus: number | null = null;
  let payload: any = null;
  let errorMessage = '';

  try {
    console.log('📡 Making Firecrawl API request...');
    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload),
      signal: ctrl.signal
    });

    firecrawlStatus = resp.status;
    console.log('📊 Firecrawl response status:', firecrawlStatus);

    if (!resp.ok) {
      const errorText = await resp.text();
      console.log('❌ Firecrawl error response:', errorText);
      throw new Error(`Firecrawl API error: ${firecrawlStatus} - ${errorText}`);
    }

    payload = await resp.json();
    console.log('✅ Firecrawl response received, payload keys:', Object.keys(payload || {}));

  } catch (e: any) {
    clearTimeout(timer);
    errorMessage = `Firecrawl fetch error: ${e?.name || 'Error'}: ${e?.message || String(e)}`;
    console.log('💥 Firecrawl error:', errorMessage);

    // Log failed request to database
    try {
      const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      await supabase.from('psa_request_log').insert({
        ip_address: clientIP,
        cert_number: cert,
        success: false,
        response_time_ms: Date.now() - requestStart,
        error_message: errorMessage
      });
    } catch (logError) {
      console.log('❌ Failed to log error to database:', logError);
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: errorMessage,
        diagnostics: {
          hadApiKey: true,
          firecrawlStatus,
          firecrawlMs: Date.now() - requestStart,
          totalMs: Date.now() - started
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    clearTimeout(timer);
  }

  const firecrawlMs = Date.now() - requestStart;
  console.log('⏱️ Firecrawl took:', firecrawlMs, 'ms');

  const data = payload?.data ?? payload ?? {};
  const html: string = data?.html || data?.content || payload?.html || '';
  const markdown: string = data?.markdown || payload?.markdown || '';

  console.log('📄 Content received:');
  console.log('- HTML length:', html.length);
  console.log('- Markdown length:', markdown.length);

  if (!html && !markdown) {
    errorMessage = 'No html/markdown returned from Firecrawl';
    console.log('❌', errorMessage);

    return new Response(
      JSON.stringify({
        ok: false,
        error: errorMessage,
        diagnostics: {
          hadApiKey: true,
          firecrawlStatus,
          firecrawlMs,
          totalMs: Date.now() - started
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('🔍 Starting data extraction...');
  const text = (html || markdown).replace(/\s+/g, ' ').trim();
  
  // Enhanced extraction function that cleans HTML properly
  const extractCleanValue = (patterns: RegExp[], fallbackPatterns: RegExp[] = []): string | null => {
    // Try main patterns first
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let value = match[1].trim();
        
        // Clean HTML tags and entities
        value = value.replace(/<[^>]*>/g, ''); // Remove HTML tags
        value = value.replace(/&amp;/g, '&'); // Decode HTML entities
        value = value.replace(/&lt;/g, '<');
        value = value.replace(/&gt;/g, '>');
        value = value.replace(/&quot;/g, '"');
        value = value.replace(/&#39;/g, "'");
        value = value.replace(/&nbsp;/g, ' ');
        
        // Remove extra whitespace and clean up
        value = value.replace(/\s+/g, ' ').trim();
        
        // Skip if result is empty or just whitespace
        if (value && value.length > 0) {
          console.log('🔍 Extract success:', pattern.toString(), '→', value);
          return value;
        }
      }
    }
    
    // Try fallback patterns if main patterns failed
    for (const pattern of fallbackPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let value = match[1].trim();
        value = value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (value && value.length > 0) {
          console.log('🔍 Extract fallback success:', pattern.toString(), '→', value);
          return value;
        }
      }
    }
    
    console.log('🔍 Extract failed for patterns:', patterns.map(p => p.toString()));
    return null;
  };

  // Improved brand extractor - looks for actual Pokemon content
  const extractBrand = (): string | null => {
    // Look for Pokemon card titles in the content
    const pokemonPatterns = [
      /POKEMON[^<>]*DRI[^<>]*EN[^<>]*DESTINED[^<>]*RIVALS/i,
      /POKEMON[^<>]*SCARLET[^<>]*VIOLET/i,
      /POKEMON[^<>]*BRILLIANT[^<>]*STARS/i,
      /POKEMON[^<>]*FUSION[^<>]*STRIKE/i,
      /POKEMON[^<>]*EVOLVING[^<>]*SKIES/i,
      /POKEMON[^<>]*CELEBRATIONS/i,
      /POKEMON[^<>]*CHILLING[^<>]*REIGN/i,
      /POKEMON[^<>]*BATTLE[^<>]*STYLES/i,
      /POKEMON[^<>]*SHINING[^<>]*FATES/i,
      /POKEMON[^<>]*VIVID[^<>]*VOLTAGE/i,
      /POKEMON[^<>]*CHAMPIONS[^<>]*PATH/i,
      /POKEMON[^<>]*DARKNESS[^<>]*ABLAZE/i,
      /POKEMON[^<>]*REBEL[^<>]*CLASH/i,
      /POKEMON[^<>]*SWORD[^<>]*SHIELD/i,
      /POKEMON\s+[\w\s&'-]+/i
    ];
    
    for (const pattern of pokemonPatterns) {
      const match = text.match(pattern);
      if (match) {
        let brand = match[0].trim();
        brand = brand.replace(/\s+/g, ' ');
        console.log('🔍 Pokemon brand found:', brand);
        return brand;
      }
    }
    
    // Fallback to generic extraction
    return extractCleanValue([
      /Brand\/Title[:\s]*([^\n\r<>]+)/i,
      /Brand[:\s]*([^\n\r<>]+)/i
    ]);
  };

  // Improved grade extractor - looks for PSA grade patterns
  const extractGrade = (): string | null => {
    // Look for PSA grade patterns (PSA 1-10)
    const gradePatterns = [
      /PSA\s+(\d{1,2})/i,
      /Grade\s+(\d{1,2})/i,
      /Item\s+Grade[:\s]*(\d{1,2})/i,
      /"grade"[:\s]*"?(\d{1,2})"?/i
    ];
    
    for (const pattern of gradePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const grade = parseInt(match[1]);
        if (grade >= 1 && grade <= 10) {
          console.log('🔍 PSA Grade found:', grade.toString());
          return grade.toString();
        }
      }
    }
    
    // Look for text grades
    const textGradePatterns = [
      /Grade[:\s]*(POOR|FAIR|GOOD|VG|EX|NM|MINT)/i,
      /Item\s+Grade[:\s]*(POOR|FAIR|GOOD|VG|EX|NM|MINT)/i
    ];
    
    for (const pattern of textGradePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        console.log('🔍 Text grade found:', match[1]);
        return match[1].toUpperCase();
      }
    }
    
    console.log('🔍 No valid grade found');
    return null;
  };

  // Specific extractor for year (4-digit year)
  const extractYear = (): string | null => {
    return extractCleanValue([
      /Year[:\s]*([0-9]{4})/i,
      />([0-9]{4})<\/dd>/i
    ]);
  };

  // Specific extractor for card number (alphanumeric with hyphens)
  const extractCardNumber = (): string | null => {
    return extractCleanValue([
      /Card Number[:\s]*([A-Z0-9\-#\/\s]+)/i,
      />([A-Z0-9\-#\/\s]+)<\/dd>/i
    ]);
  };

  // Game/Sport extractor - auto-detects from brand
  const extractGameSport = (brand: string | null): string | null => {
    if (!brand) return null;
    
    const brandLower = brand.toLowerCase();
    
    if (brandLower.includes('pokemon')) {
      console.log('🔍 Game detected: pokemon');
      return 'pokemon';
    }
    if (brandLower.includes('magic') || brandLower.includes('mtg')) {
      console.log('🔍 Game detected: magic');
      return 'magic';
    }
    if (brandLower.includes('yugioh') || brandLower.includes('yu-gi-oh')) {
      console.log('🔍 Game detected: yugioh');
      return 'yugioh';
    }
    if (brandLower.includes('dragon ball')) {
      console.log('🔍 Game detected: dragon ball');
      return 'dragon ball';
    }
    
    console.log('🔍 Game not detected from brand:', brand);
    return null;
  };

  // Enhanced parsing with better patterns
  const isValid = text.includes('PSA Certification Verification') && 
                 !text.includes('not found') && 
                 !text.includes('No results found');

  console.log('✅ Certificate validity check:', isValid);

  const brandTitle = extractBrand();
  const grade = extractGrade();
  const gameSport = extractGameSport(brandTitle);

  const certData: PSACertificateData = {
    certNumber: cert,
    isValid,
    grade,
    year: extractYear(),
    brandTitle,
    subject: extractCleanValue([
      /Subject[:\s]*([^\n\r<>]+)/i,
      />([^<>]*(?:MEWTWO|CHARIZARD|PIKACHU)[^<>]*)<\/dd>/i,
      />([^<>]*(?:'S|EX|GX|V|VMAX)[^<>]*)<\/dd>/i
    ]),
    cardNumber: extractCardNumber(),
    varietyPedigree: extractCleanValue([
      /Variety\/Pedigree[:\s]*([^\n\r<>]+)/i,
      /Pedigree[:\s]*([^\n\r<>]+)/i,
      />([^<>]*(?:RARE|HOLO|SPECIAL|ILLUSTRATION)[^<>]*)<\/dd>/i
    ]),
    category: extractCleanValue([
      /Category[:\s]*([^\n\r<>]+)/i,
      />([^<>]*(?:TCG|CARDS|GAMING)[^<>]*)<\/dd>/i
    ]),
    gameSport,
    psaUrl
  };

  // Extract images
  const imgs: string[] = [];
  if (html) {
    const og = html.match(/<meta[^>]+property=['"]og:image['"][^>]+content=['"]([^'"]+)['"]/i)?.[1];
    if (og) imgs.push(og);
    const tags = html.match(/<img[^>]+src=['"]([^'"]+)['"]/gi) || [];
    for (const t of tags) {
      const u = t.match(/src=['"]([^'"]+)['"]/i)?.[1];
      if (u && !imgs.includes(u)) imgs.push(u);
    }
  }

  certData.imageUrl = imgs[0] ?? null;
  certData.imageUrls = imgs;

  console.log('📊 Extracted certificate data:', JSON.stringify(certData, null, 2));

  // Save to database
  console.log('💾 Saving to database...');
  try {
    const { error: dbError } = await supabase
      .from('psa_certificates')
      .upsert({
        cert_number: cert,
        is_valid: certData.isValid,
        grade: certData.grade,
        year: certData.year,
        brand: certData.brandTitle,
        subject: certData.subject,
        card_number: certData.cardNumber,
        variety_pedigree: certData.varietyPedigree,
        category: certData.category,
        psa_url: certData.psaUrl,
        image_url: certData.imageUrl,
        image_urls: certData.imageUrls,
        raw_html: html,
        raw_markdown: markdown,
        firecrawl_response: payload,
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cert_number'
      });

    if (dbError) {
      console.log('❌ Database save error:', dbError);
    } else {
      console.log('✅ Successfully saved to database');
    }

    // Log successful request
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    await supabase.from('psa_request_log').insert({
      ip_address: clientIP,
      cert_number: cert,
      success: true,
      response_time_ms: Date.now() - requestStart
    });

    console.log('📝 Request logged successfully');

  } catch (dbSaveError) {
    console.log('💥 Database operation failed:', dbSaveError);
  }

  console.log('🎉 Returning successful result');
  const totalMs = Date.now() - started;
  console.log('⏱️ Total request time:', totalMs, 'ms');

  return new Response(
    JSON.stringify({
      ok: true,
      source: 'firecrawl_scrape',
      url: psaUrl,
      ...certData,
      diagnostics: {
        hadApiKey: true,
        firecrawlStatus,
        firecrawlMs,
        totalMs,
        formats: ['markdown', 'html'],
        usedCache: false,
        dbSaved: true
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});