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

interface PSAApiResponse {
  success: boolean
  data?: {
    certNumber: string
    isValid: boolean
    grade?: string
    year?: string
    brandTitle?: string
    subject?: string
    cardNumber?: string
    category?: string
    varietyPedigree?: string
    gameSport?: string
    imageUrl?: string
    imageUrls?: string[]
    psaUrl?: string
  }
  error?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { certNumber, lookupType = 'cert' } = await req.json()

    if (!certNumber) {
      return new Response(
        JSON.stringify({ success: false, error: 'Certificate number is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`PSA lookup started for cert: ${certNumber}`)

    // Initialize Supabase clients
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey)

    // Get PSA API token from system settings using service client
    const { data: tokenData, error: tokenError } = await supabaseService.functions.invoke('get-system-setting', {
      body: { keyName: 'PSA_API_TOKEN' }
    })

    if (tokenError || !tokenData?.value) {
      console.error('PSA API token not configured:', tokenError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'PSA API token not configured. Please configure it in Admin settings.' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const psaApiToken = tokenData.value

    // Log the request
    await supabase.from('psa_request_log').insert({
      cert_number: certNumber,
      ip_address: req.headers.get('x-forwarded-for') || 'unknown'
    })

    // Check if we have cached data first
    const { data: cachedData } = await supabase
      .from('psa_certificates')
      .select('*')
      .eq('cert_number', certNumber)
      .single()

    if (cachedData && cachedData.is_valid) {
      console.log(`Using cached PSA data for cert: ${certNumber}`)
      
      const response: PSAApiResponse = {
        success: true,
        data: {
          certNumber: cachedData.cert_number,
          isValid: cachedData.is_valid,
          grade: cachedData.grade || undefined,
          year: cachedData.year || undefined,
          brandTitle: cachedData.brand || undefined,
          subject: cachedData.subject || undefined,
          cardNumber: cachedData.card_number || undefined,
          category: cachedData.category || undefined,
          varietyPedigree: cachedData.variety_pedigree || undefined,
          imageUrl: cachedData.image_url || undefined,
          imageUrls: cachedData.image_urls ? JSON.parse(JSON.stringify(cachedData.image_urls)) : undefined,
          psaUrl: cachedData.psa_url || `https://www.psacard.com/cert/${certNumber}`
        }
      }

      console.log('Returning cached PSA data:', response.data)
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Make API call to PSA using the official API
    console.log(`Making PSA API call for cert: ${certNumber}`)
    
    const psaApiUrl = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`
    const psaImagesUrl = `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${certNumber}`
    
    // Make both API calls in parallel
    const [psaResponse, psaImagesResponse] = await Promise.all([
      fetch(psaApiUrl, {
        method: 'GET',
        headers: {
          'authorization': `bearer ${psaApiToken}`,
          'Content-Type': 'application/json'
        }
      }),
      fetch(psaImagesUrl, {
        method: 'GET',
        headers: {
          'authorization': `bearer ${psaApiToken}`,
          'Content-Type': 'application/json'
        }
      })
    ])

    if (!psaResponse.ok) {
      console.error(`PSA API error: ${psaResponse.status} ${psaResponse.statusText}`)
      throw new Error(`PSA API returned ${psaResponse.status}: ${psaResponse.statusText}`)
    }

    const psaData = await psaResponse.json()
    console.log('PSA API response:', psaData)
    
    // Handle images response (don't fail if images API fails)
    let psaImages = null
    let imageUrls = []
    let primaryImageUrl = undefined
    
    if (psaImagesResponse.ok) {
      psaImages = await psaImagesResponse.json()
      console.log('PSA Images API response:', psaImages)
      
      // Extract image URLs from the response structure
      if (Array.isArray(psaImages)) {
        imageUrls = psaImages.map(img => img.ImageURL).filter(url => url)
        // Find the front image or use the first available image
        const frontImage = psaImages.find(img => img.IsFrontImage === true)
        primaryImageUrl = frontImage?.ImageURL || imageUrls[0]
      }
    } else {
      console.warn(`PSA Images API error: ${psaImagesResponse.status} ${psaImagesResponse.statusText}`)
    }

    // Extract PSA certificate data from the nested structure
    const psaCert = psaData?.PSACert
    
    // Extract numeric grade from "GEM MT 10" format
    const extractNumericGrade = (gradeStr: string): string | undefined => {
      if (!gradeStr) return undefined;
      // Extract number from grade string (e.g., "GEM MT 10" -> "10")
      const match = gradeStr.match(/\d+/);
      return match ? match[0] : undefined;
    };
    
    // Transform PSA API response to our format
    const psaApiResponse = {
      certNumber: certNumber,
      isValid: psaCert ? true : false,
      grade: extractNumericGrade(psaCert?.CardGrade),
      year: psaCert?.Year || undefined,
      brandTitle: psaCert?.Brand || undefined,
      subject: psaCert?.Subject || undefined,
      cardNumber: psaCert?.CardNumber || undefined,
      category: psaCert?.Category || undefined,
      varietyPedigree: psaCert?.Variety || undefined,
      gameSport: undefined, // Not available in PSA API
      imageUrl: primaryImageUrl,
      imageUrls: imageUrls,
      psaUrl: `https://www.psacard.com/cert/${certNumber}`
    }

    // Store in database for caching
    const { error: insertError } = await supabase
      .from('psa_certificates')
      .upsert({
        cert_number: certNumber,
        is_valid: psaApiResponse.isValid,
        grade: psaApiResponse.grade,
        year: psaApiResponse.year,
        brand: psaApiResponse.brandTitle,
        subject: psaApiResponse.subject,
        card_number: psaApiResponse.cardNumber,
        category: psaApiResponse.category,
        variety_pedigree: psaApiResponse.varietyPedigree,
        image_url: psaApiResponse.imageUrl,
        image_urls: psaApiResponse.imageUrls,
        psa_url: psaApiResponse.psaUrl,
        scraped_at: new Date().toISOString()
      })

    if (insertError) {
      console.error('Error caching PSA data:', insertError)
    }

    // Update request log
    await supabase
      .from('psa_request_log')
      .update({ 
        success: true,
        response_time_ms: 1000 // placeholder
      })
      .eq('cert_number', certNumber)
      .order('created_at', { ascending: false })
      .limit(1)

    const response: PSAApiResponse = {
      success: true,
      data: psaApiResponse
    }

    console.log(`PSA lookup completed for cert: ${certNumber}`, response.data)

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('PSA lookup error:', error)
    
    const response: PSAApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})