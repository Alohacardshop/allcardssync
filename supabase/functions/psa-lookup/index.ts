import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CFG } from "../_lib/config.ts";
import { corsHeaders, getCorsHeaders } from "../_lib/cors.ts";
import { log, genRequestId } from "../_lib/log.ts";
import { canCall, report } from "../_lib/circuit.ts";
import { fetchJson } from "../_lib/http.ts";
import { queueBackgroundRefresh } from "./helpers.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = genRequestId();
  const origin = req.headers.get("origin");

  try {
    const { cert_number } = await req.json().catch(() => ({}))
    log.info('[psa-lookup] Request received', { requestId, cert_number })
    
    if (!cert_number || String(cert_number).trim() === '') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing certificate number' }),
        { headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      )
    }

    // Check circuit breaker
    if (!canCall("psa")) {
      log.warn('[psa-lookup] Circuit breaker open for PSA API', { requestId });
      return new Response(
        JSON.stringify({ ok: false, error: 'PSA API temporarily unavailable' }),
        { status: 503, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      )
    }

    const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    })

    // Check PSA image cache (stale-while-revalidate)
    const freshCutoff = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: imageCache } = await supabase
      .from('catalog_v2.psa_image_cache')
      .select('*')
      .eq('cert', cert_number)
      .gt('updated_at', freshCutoff)
      .maybeSingle();

    if (imageCache) {
      log.info('[psa-lookup] Cache hit (fresh)', { requestId, cert_number });
      
      // Queue background refresh (fire-and-forget)
      queueBackgroundRefresh(supabase, cert_number).catch(() => {});
      
      return new Response(
        JSON.stringify({
          ok: true,
          imageUrl: imageCache.primary_url,
          imageUrls: imageCache.all_urls,
          source: 'cache'
        }),
        { headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      )
    }

    // Check old PSA certificates cache
    const { data: oldCache } = await supabase
      .from('psa_certificates')
      .select('*')
      .eq('cert_number', cert_number)
      .maybeSingle()

    if (oldCache) {
      log.info('[psa-lookup] Old cache hit', { requestId, cert_number });
      return new Response(
        JSON.stringify({
          ok: true,
          data: oldCache,
          source: 'cache'
        }),
        { headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      )
    }

    // Get PSA API token
    const psaToken = CFG.PSA_PUBLIC_API_TOKEN;
    if (!psaToken) {
      log.error('[psa-lookup] PSA API token not configured', { requestId });
      return new Response(
        JSON.stringify({ ok: false, error: 'PSA API token not configured' }),
        { status: 500, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      )
    }

    // Fetch from PSA API
    log.info('[psa-lookup] Fetching from PSA API', { requestId, cert_number });
    
    try {
      const certUrl = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert_number}`;
      const imagesUrl = `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${cert_number}`;

      const [certData, imagesData] = await Promise.all([
        fetchJson<any>(certUrl, {
          headers: {
            'authorization': `bearer ${psaToken}`,
            'Content-Type': 'application/json'
          }
        }, { tries: 3, timeoutMs: 10000 }),
        fetchJson<any[]>(imagesUrl, {
          headers: {
            'authorization': `bearer ${psaToken}`,
            'Content-Type': 'application/json'
          }
        }, { tries: 2, timeoutMs: 8000 }).catch(() => null) // Images are optional
      ]);

      report("psa", true);

      // Validate certificate data
      if (!certData?.PSACert?.CertNumber) {
        log.warn('[psa-lookup] No valid certificate data', { requestId, cert_number });
        return new Response(
          JSON.stringify({ ok: false, error: 'NO_DATA' }),
          { headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
        )
      }

      const psaCert = certData.PSACert;
      const extractNumericGrade = (gradeStr: string): string | undefined => {
        if (!gradeStr) return undefined;
        const match = gradeStr.match(/\d+/);
        return match ? match[0] : undefined;
      };

      // Extract image URLs
      let imageUrls: string[] = [];
      let primaryImageUrl: string | undefined = undefined;

      if (imagesData && Array.isArray(imagesData)) {
        imageUrls = imagesData.map(img => img.ImageURL).filter(url => url);
        const frontImage = imagesData.find(img => img.IsFrontImage === true);
        primaryImageUrl = frontImage?.ImageURL || imageUrls[0];
      }

      const responseData = {
        certNumber: cert_number,
        isValid: true,
        grade: extractNumericGrade(psaCert?.CardGrade),
        year: psaCert?.Year || undefined,
        brandTitle: psaCert?.Brand || undefined,
        subject: psaCert?.Subject || undefined,
        cardNumber: psaCert?.CardNumber || undefined,
        category: psaCert?.Category || undefined,
        varietyPedigree: psaCert?.Variety || undefined,
        imageUrl: primaryImageUrl,
        imageUrls: imageUrls,
        psaUrl: `https://www.psacard.com/cert/${cert_number}`
      };

      // Cache in new image cache table
      await supabase
        .from('catalog_v2.psa_image_cache')
        .upsert({
          cert: cert_number,
          primary_url: primaryImageUrl,
          all_urls: imageUrls,
          updated_at: new Date().toISOString()
        })
        .catch(err => log.error('[psa-lookup] Failed to cache images', { requestId, error: err.message }));

      // Also cache in old table for backwards compatibility
      await supabase
        .from('psa_certificates')
        .upsert({
          cert_number,
          is_valid: true,
          grade: responseData.grade,
          year: responseData.year,
          brand: responseData.brandTitle,
          subject: responseData.subject,
          card_number: responseData.cardNumber,
          category: responseData.category,
          variety_pedigree: responseData.varietyPedigree,
          image_url: responseData.imageUrl,
          image_urls: responseData.imageUrls,
          psa_url: responseData.psaUrl,
          scraped_at: new Date().toISOString()
        })
        .catch(err => log.error('[psa-lookup] Failed to cache cert', { requestId, error: err.message }));

      log.info('[psa-lookup] Successfully processed and cached', { requestId, cert_number });

      return new Response(
        JSON.stringify({
          ok: true,
          data: responseData,
          source: 'psa_api'
        }),
        { headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );

    } catch (apiError) {
      report("psa", false);
      log.error('[psa-lookup] PSA API error', { requestId, error: String(apiError) });
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to fetch from PSA API',
          message: String(apiError)
        }),
        { status: 500, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
      );
    }

  } catch (error) {
    log.error('[psa-lookup] Unexpected error', { requestId, error: String(error) });
    
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Unhandled server error'
      }),
      { headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json', 'X-Request-Id': requestId } }
    )
  }
})
