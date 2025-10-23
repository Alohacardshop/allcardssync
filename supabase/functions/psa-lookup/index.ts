import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { CFG } from "../_lib/config.ts";
import { corsHeaders } from "../_lib/cors.ts";
import { log, genRequestId } from "../_lib/log.ts";
import { canCall, report } from "../_lib/circuit.ts";
import { fetchJson } from "../_lib/http.ts";
import { 
  buildResponseHeaders, 
  buildJsonResponse,
  normalizePsaCertData,
  transformPsaApiResponse,
  cacheCertificateData
} from "./helpers.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = genRequestId();
  const origin = req.headers.get("origin");

  const headers = buildResponseHeaders(origin, requestId);

  try {
    const { cert_number } = await req.json().catch(() => ({}))
    log.info('[psa-lookup] Request received', { requestId, cert_number })
    
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
          { ok: false, error: 'NO_DATA' },
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
          error: 'Failed to fetch from PSA API',
          message: String(apiError)
        },
        { status: 500, headers }
      );
    }

  } catch (error) {
    log.error('[psa-lookup] Unexpected error', { requestId, error: String(error) });
    
    const headers = buildResponseHeaders(origin, requestId);
    return buildJsonResponse(
      {
        ok: false,
        error: 'Unhandled server error'
      },
      { headers }
    );
  }
})
