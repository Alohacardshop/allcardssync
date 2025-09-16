import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const psaApiToken = Deno.env.get('PSA_API_TOKEN')!

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

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Make API call to PSA (replace with actual PSA API endpoint when available)
    console.log(`Making PSA API call for cert: ${certNumber}`)
    
    // For now, we'll simulate a PSA API call since the actual API endpoint structure isn't provided
    // This is a placeholder that returns structured data for testing
    // TODO: Replace with actual PSA API integration when endpoint details are available
    
    const mockPSAResponse = {
      certNumber: certNumber,
      isValid: true,
      grade: "10",
      year: "2023",
      brandTitle: "Pokemon",
      subject: "Pikachu",
      cardNumber: "1",
      category: "Trading Cards",
      varietyPedigree: "",
      gameSport: "Pokemon",
      imageUrl: "",
      imageUrls: [],
      psaUrl: `https://www.psacard.com/cert/${certNumber}`
    }

    // Store in database for caching
    const { error: insertError } = await supabase
      .from('psa_certificates')
      .upsert({
        cert_number: certNumber,
        is_valid: mockPSAResponse.isValid,
        grade: mockPSAResponse.grade,
        year: mockPSAResponse.year,
        brand: mockPSAResponse.brandTitle,
        subject: mockPSAResponse.subject,
        card_number: mockPSAResponse.cardNumber,
        category: mockPSAResponse.category,
        variety_pedigree: mockPSAResponse.varietyPedigree,
        image_url: mockPSAResponse.imageUrl,
        image_urls: mockPSAResponse.imageUrls,
        psa_url: mockPSAResponse.psaUrl,
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
      data: mockPSAResponse
    }

    console.log(`PSA lookup completed for cert: ${certNumber}`)

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