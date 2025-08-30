import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { log } from "../_shared/log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PSAApiResponse {
  ID?: number;
  CertNumber?: string;
  Year?: string;
  Brand?: string;
  Subject?: string;
  SpecNumber?: string;
  CategoryName?: string;
  GradeNumeric?: number;
  GradeDisplay?: string;
  LabelType?: string;
  VarietyPedigree?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user authentication and admin role
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role
    const { data: hasAdminRole } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { cert } = await req.json();
    
    if (!cert) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Certificate number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const certStr = String(cert).trim();
    log.info('Admin PSA test started', { cert: certStr, userId: user.id });

    const startTime = Date.now();
    const timings = {
      total: 0,
      tokenRetrieval: 0,
      psaCardApi: 0,
      psaImageApi: 0
    };

    let psaCardData: PSAApiResponse | null = null;
    let psaImageData: any = null;
    let errors: string[] = [];

    try {
      // Get PSA API token
      const tokenStart = Date.now();
      const { data: tokenSettings } = await supabase
        .from('system_settings')
        .select('key_value')
        .eq('key_name', 'PSA_PUBLIC_API_TOKEN')
        .single();

      const psaToken = tokenSettings?.key_value;
      timings.tokenRetrieval = Date.now() - tokenStart;

      if (!psaToken) {
        errors.push('PSA_PUBLIC_API_TOKEN not found in system settings');
      } else {
        // Test PSA Card API
        const cardStart = Date.now();
        try {
          const cardResponse = await fetch(
            `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certStr}`,
            {
              headers: {
                'Authorization': `Bearer ${psaToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          timings.psaCardApi = Date.now() - cardStart;

          if (cardResponse.ok) {
            psaCardData = await cardResponse.json();
            log.info('PSA Card API success', { cert: certStr, hasData: !!psaCardData });
          } else {
            errors.push(`PSA Card API error: ${cardResponse.status} ${cardResponse.statusText}`);
          }
        } catch (error) {
          timings.psaCardApi = Date.now() - cardStart;
          errors.push(`PSA Card API exception: ${error.message}`);
        }

        // Test PSA Image API
        const imageStart = Date.now();
        try {
          const imageResponse = await fetch(
            `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${certStr}`,
            {
              headers: {
                'Authorization': `Bearer ${psaToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          timings.psaImageApi = Date.now() - imageStart;

          if (imageResponse.ok) {
            psaImageData = await imageResponse.json();
            log.info('PSA Image API success', { cert: certStr, imageCount: psaImageData?.ImageUrls?.length || 0 });
          } else {
            errors.push(`PSA Image API error: ${imageResponse.status} ${imageResponse.statusText}`);
          }
        } catch (error) {
          timings.psaImageApi = Date.now() - imageStart;
          errors.push(`PSA Image API exception: ${error.message}`);
        }
      }
    } catch (error) {
      errors.push(`System error: ${error.message}`);
    }

    timings.total = Date.now() - startTime;

    // Normalize the data similar to how psa-scrape does it
    const normalized = {
      certNumber: certStr,
      grade: psaCardData?.GradeDisplay || (psaCardData?.GradeNumeric ? String(psaCardData.GradeNumeric) : null),
      year: psaCardData?.Year || null,
      brandTitle: psaCardData?.Brand || null,
      subject: psaCardData?.Subject || null,
      cardNumber: psaCardData?.SpecNumber || null,
      varietyPedigree: psaCardData?.VarietyPedigree || null,
      labelType: psaCardData?.LabelType || null,
      categoryName: psaCardData?.CategoryName || null,
      imageUrls: psaImageData?.ImageUrls || [],
      imageUrl: psaImageData?.ImageUrls?.[0] || null
    };

    const response = {
      ok: true,
      cert: certStr,
      timings,
      errors,
      raw: {
        cardData: psaCardData,
        imageData: psaImageData
      },
      normalized,
      summary: {
        tokenFound: !!psaToken,
        cardApiSuccess: !!psaCardData,
        imageApiSuccess: !!psaImageData,
        totalFields: Object.values(normalized).filter(v => v !== null && v !== undefined).length,
        imageCount: normalized.imageUrls.length,
        hasErrors: errors.length > 0
      }
    };

    log.info('Admin PSA test completed', { 
      cert: certStr, 
      success: response.summary.cardApiSuccess,
      totalTime: timings.total,
      errors: errors.length
    });

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    log.error('Admin PSA test error', { error: error.message });
    
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: `Server error: ${error.message}` 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});