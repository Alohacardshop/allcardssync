import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CFG } from "../_lib/config.ts";
import { corsHeaders } from "../_lib/cors.ts";
import { log, genRequestId } from "../_lib/log.ts";
import { canCall, report } from "../_lib/circuit.ts";
import { 
  buildResponseHeaders, 
  buildJsonResponse,
  normalizePsaCertData,
  transformPsaApiResponse,
  cacheCertificateData
} from "./helpers.ts";
import { scrapeComicCert } from "./scraper.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = genRequestId();
  const origin = req.headers.get("origin");

  const headers = buildResponseHeaders(origin, requestId);

  try {
    // Authenticate user and require staff/admin role
    const user = await requireAuth(req);
    await requireRole(user.id, ['admin', 'staff']);

    const { cert_number } = await req.json().catch(() => ({}))
    log.info('[psa-lookup] Request received', { requestId, cert_number, userId: user.id })
    
    if (!cert_number || String(cert_number).trim() === '') {
      return buildJsonResponse(
        { ok: false, error: 'Missing certificate number' },
        { headers }
      );
    }

    // Check circuit breaker
    if (!canCall("psa")) {
      log.warn('[psa-lookup] Circuit breaker open for PSA API', { requestId });
      return buildJsonResponse(
        { ok: false, error: 'PSA API temporarily unavailable' },
        { status: 503, headers }
      );
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
      
      return buildJsonResponse(
        {
          ok: true,
          imageUrl: imageCache.primary_url,
          imageUrls: imageCache.all_urls,
          source: 'cache'
        },
        { headers }
      );
    }

    // Check old PSA certificates cache (with freshness check)
    const { data: oldCache } = await supabase
      .from('psa_certificates')
      .select('*')
      .eq('cert_number', cert_number)
      .gt('scraped_at', freshCutoff)
      .maybeSingle()

    if (oldCache) {
      log.info('[psa-lookup] Old cache hit', { requestId, cert_number });
      
      return buildJsonResponse(
        {
          ok: true,
          data: normalizePsaCertData(oldCache),
          source: 'cache'
        },
        { headers }
      );
    }

    // Get PSA API token
    const psaToken = CFG.PSA_PUBLIC_API_TOKEN;
    if (!psaToken) {
      log.error('[psa-lookup] PSA API token not configured', { requestId });
      return buildJsonResponse(
        { ok: false, error: 'PSA API token not configured' },
        { status: 500, headers }
      );
    }

    // Fetch from PSA API
    log.info('[psa-lookup] Fetching from PSA API', { requestId, cert_number });
    
    try {
      const certUrl = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert_number}`;
      const imagesUrl = `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${cert_number}`;
      const authHeaders = {
        'authorization': `bearer ${psaToken}`,
        'Content-Type': 'application/json'
      };

      // Fetch cert data with manual handling for 404
      const certResponse = await fetch(certUrl, { headers: authHeaders });
      
      if (certResponse.status === 404 || (await certResponse.clone().json().catch(() => ({})))?.ServerMessage === "No data found") {
        // API returned 404 - likely a comic. Try scraping the website
        log.info('[psa-lookup] API returned 404, trying web scrape for comics', { requestId, cert_number });
        
        const scrapedData = await scrapeComicCert(cert_number, requestId);
        
        if (scrapedData) {
          report("psa", true);
          
          // Cache the scraped data
          await cacheCertificateData(supabase, cert_number, scrapedData, requestId);
          
          return buildJsonResponse(
            {
              ok: true,
              data: scrapedData,
              source: 'psa_scrape'
            },
            { headers }
          );
        }
        
        // Scraping also failed
        report("psa", true); // API worked, just no data
        return buildJsonResponse(
          { ok: false, error: 'NOT_FOUND', message: 'Certificate not found in PSA database' },
          { status: 404, headers }
        );
      }
      
      if (!certResponse.ok) {
        throw new Error(`HTTP ${certResponse.status}: ${certResponse.statusText}`);
      }

      const certData = await certResponse.json();
      
      // Check PSA's own "not found" response format
      if (certData?.IsValidRequest === true && certData?.ServerMessage === "No data found") {
        log.info('[psa-lookup] PSA returned no data for cert', { requestId, cert_number });
        report("psa", true);
        return buildJsonResponse(
          { ok: false, error: 'NOT_FOUND', message: 'Certificate not found in PSA database' },
          { status: 404, headers }
        );
      }

      // Fetch images (optional, don't fail if missing)
      let imagesData = null;
      try {
        const imagesResponse = await fetch(imagesUrl, { headers: authHeaders });
        if (imagesResponse.ok) {
          imagesData = await imagesResponse.json();
        }
      } catch {
        // Images are optional
      }

      report("psa", true);
      
      // Log response structure for debugging
      log.info('[psa-lookup] PSA API response structure', { 
        requestId, 
        certDataKeys: Object.keys(certData || {}),
        hasPSACert: !!certData?.PSACert,
        certDataSample: JSON.stringify(certData).slice(0, 500)
      });

      // Validate certificate data
      if (!certData?.PSACert?.CertNumber) {
        log.warn('[psa-lookup] No valid certificate data', { requestId, cert_number });
        return buildJsonResponse(
          { ok: false, error: 'NO_DATA', message: 'Invalid certificate data returned' },
          { headers }
        );
      }

      const psaCert = certData.PSACert;
      const responseData = transformPsaApiResponse(cert_number, psaCert, imagesData);

      // Cache the certificate data
      await cacheCertificateData(supabase, cert_number, responseData, requestId);

      log.info('[psa-lookup] Successfully processed and cached', { requestId, cert_number });

      return buildJsonResponse(
        {
          ok: true,
          data: responseData,
          source: 'psa_api'
        },
        { headers }
      );

    } catch (apiError) {
      report("psa", false);
      log.error('[psa-lookup] PSA API error', { requestId, error: String(apiError) });
      
      return buildJsonResponse(
        {
          ok: false,
          error: 'API_ERROR',
          message: String(apiError)
        },
        { status: 502, headers }
      );
    }

  } catch (error) {
    log.error('[psa-lookup] Unexpected error', { requestId, error: String(error) });
    
    const headers = buildResponseHeaders(origin, requestId);
    
    // Handle authentication errors
    if (error.message?.includes('Authorization') || error.message?.includes('authentication') || error.message?.includes('permissions')) {
      return buildJsonResponse(
        { ok: false, error: error.message },
        { status: 401, headers }
      );
    }
    
    return buildJsonResponse(
      {
        ok: false,
        error: 'Unhandled server error'
      },
      { headers }
    );
  }
})
