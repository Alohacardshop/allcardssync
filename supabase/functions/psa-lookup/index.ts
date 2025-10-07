import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { cert_number } = await req.json().catch(() => ({}))
    console.log('[psa-lookup] Received request for cert:', cert_number)
    
    // Validate input - always return JSON, never throw
    if (!cert_number || String(cert_number).trim() === '') {
      console.log('[psa-lookup] Missing certificate number')
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Missing certificate number' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase clients
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })
    const supabaseServiceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    })

    // Get PSA API token
    const { data: tokenData, error: tokenError } = await supabaseServiceClient.functions.invoke(
      'get-system-setting',
      { body: { keyName: 'PSA_API_TOKEN' } }
    )

    if (tokenError || !tokenData?.value) {
      console.error('[psa-lookup] PSA API token not configured:', tokenError)
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'PSA API token not configured'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const psaApiToken = tokenData.value

    // Log the request
    const { data: logEntry } = await supabaseServiceClient
      .from('psa_request_log')
      .insert({
        cert_number,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        status: 'pending'
      })
      .select()
      .maybeSingle()

    // Check for cached data first
    const { data: cachedData, error: cacheError } = await supabaseClient
      .from('psa_certificates')
      .select('*')
      .eq('cert_number', cert_number)
      .single()

    if (cachedData && !cacheError) {
      console.log('[psa-lookup] Found cached data')
      if (logEntry?.id) {
        await supabaseServiceClient
          .from('psa_request_log')
          .update({ 
            status: 'success',
            response_data: cachedData,
            completed_at: new Date().toISOString()
          })
          .eq('id', logEntry.id)
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: cachedData,
          source: 'cache'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch from PSA API
    console.log('[psa-lookup] Fetching from PSA API')
    const certUrl = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert_number}`
    const imagesUrl = `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${cert_number}`

    const [certDetailsResponse, imagesResponse] = await Promise.all([
      fetch(certUrl, {
        headers: {
          'authorization': `bearer ${psaApiToken}`,
          'Content-Type': 'application/json'
        }
      }),
      fetch(imagesUrl, {
        headers: {
          'authorization': `bearer ${psaApiToken}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => null) // Make images fetch optional
    ])

    // Check certificate API (required)
    if (!certDetailsResponse.ok) {
      console.error('[psa-lookup] Certificate API error:', certDetailsResponse.status)
      
      if (logEntry?.id) {
        await supabaseServiceClient
          .from('psa_request_log')
          .update({ 
            status: 'failed',
            error_message: `PSA API error: cert ${certDetailsResponse.status}`,
            completed_at: new Date().toISOString()
          })
          .eq('id', logEntry.id)
      }

      // Return specific NO_DATA signal if 404
      if (certDetailsResponse.status === 404) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'NO_DATA'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Failed to fetch from PSA API'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const certData = await certDetailsResponse.json()
    
    // Images are optional - try to get them but don't fail if unavailable
    let imagesData = null
    if (imagesResponse && imagesResponse.ok) {
      try {
        imagesData = await imagesResponse.json()
      } catch (e) {
        console.warn('[psa-lookup] Failed to parse images data:', e)
      }
    } else {
      console.warn('[psa-lookup] Images API unavailable or failed, continuing without images')
    }

    // PSA API changed: they now use CertNumber instead of PSACertID
    if (!certData?.PSACert?.CertNumber) {
      console.log('[psa-lookup] No valid certificate data in PSA response')
      if (logEntry?.id) {
        await supabaseServiceClient
          .from('psa_request_log')
          .update({ 
            status: 'failed',
            error_message: 'No valid data in PSA response',
            completed_at: new Date().toISOString()
          })
          .eq('id', logEntry.id)
      }

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'NO_DATA'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract data
    const psaCert = certData.PSACert
    const extractNumericGrade = (gradeStr: string): string | undefined => {
      if (!gradeStr) return undefined
      const match = gradeStr.match(/\d+/)
      return match ? match[0] : undefined
    }

    let imageUrls: string[] = []
    let primaryImageUrl: string | undefined = undefined
    
    if (imagesData && Array.isArray(imagesData)) {
      imageUrls = imagesData.map(img => img.ImageURL).filter(url => url)
      const frontImage = imagesData.find(img => img.IsFrontImage === true)
      primaryImageUrl = frontImage?.ImageURL || imageUrls[0]
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
    }

    // Cache the data
    await supabaseServiceClient
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

    // Update log
    if (logEntry?.id) {
      await supabaseServiceClient
        .from('psa_request_log')
        .update({ 
          status: 'success',
          response_data: responseData,
          completed_at: new Date().toISOString()
        })
        .eq('id', logEntry.id)
    }

    console.log('[psa-lookup] Successfully processed and cached PSA data')

    return new Response(
      JSON.stringify({
        ok: true,
        data: responseData,
        source: 'psa_api'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[psa-lookup] Unexpected error:', error)
    // Always return JSON, never throw to client
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Unhandled server error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
