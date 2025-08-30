import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { log } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PSAApiResponse {
  GetByCertNumberResult?: any;
  GetImagesByCertNumberResult?: any;
}

Deno.serve(async (req) => {
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

    // Verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body = await req.json();
    const { cert } = body;

    if (!cert) {
      return new Response(JSON.stringify({ error: 'Certificate number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    log.info('Testing PSA API for admin', { cert, user_id: user.id });

    // Get PSA API token
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', 'PSA_PUBLIC_API_TOKEN')
      .single();

    const apiToken = settingsData?.key_value;
    if (!apiToken) {
      return new Response(JSON.stringify({ 
        error: 'PSA API token not configured',
        suggestion: 'Please configure PSA_PUBLIC_API_TOKEN in system settings'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const startTime = Date.now();
    const results: any = {
      cert,
      timestamp: new Date().toISOString(),
      timing: {},
      api_responses: {},
      normalized_data: {},
      errors: []
    };

    // Test GetByCertNumber endpoint
    try {
      const cardStart = Date.now();
      const cardResponse = await fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert}`, {
        headers: {
          'Authorization': `bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      results.timing.card_api_ms = Date.now() - cardStart;
      results.api_responses.card_status = cardResponse.status;
      
      if (cardResponse.ok) {
        const cardData = await cardResponse.json();
        results.api_responses.card_data = cardData;
        
        // Normalize card data
        const psaCard = cardData.GetByCertNumberResult;
        if (psaCard) {
          results.normalized_data.card = {
            cert: psaCard.CertNumber || cert,
            grade: psaCard.NumericGrade,
            gradeLabel: psaCard.GradingService,
            year: psaCard.Year,
            brandTitle: psaCard.Brand,
            subject: psaCard.Subject,
            variety: psaCard.Variety,
            cardNumber: psaCard.CardNumber,
            labelType: psaCard.LabelType,
            specNumber: psaCard.SpecNumber,
            categoryName: psaCard.CategoryName,
            totalPopulation: psaCard.TotalPopulation,
            popHigher: psaCard.PopHigher
          };
        }
      } else {
        const errorText = await cardResponse.text();
        results.errors.push(`Card API error: ${cardResponse.status} - ${errorText}`);
      }
    } catch (error) {
      results.errors.push(`Card API fetch error: ${error.message}`);
      results.timing.card_api_ms = Date.now() - startTime;
    }

    // Test GetImagesByCertNumber endpoint
    try {
      const imageStart = Date.now();
      const imageResponse = await fetch(`https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${cert}`, {
        headers: {
          'Authorization': `bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      results.timing.image_api_ms = Date.now() - imageStart;
      results.api_responses.image_status = imageResponse.status;
      
      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        results.api_responses.image_data = imageData;
        
        // Normalize image data
        const images = imageData.GetImagesByCertNumberResult;
        if (images && Array.isArray(images)) {
          results.normalized_data.images = images.map((img: any) => ({
            url: img.ImageURL,
            type: img.ImageType
          }));
        }
      } else {
        const errorText = await imageResponse.text();
        results.errors.push(`Image API error: ${imageResponse.status} - ${errorText}`);
      }
    } catch (error) {
      results.errors.push(`Image API fetch error: ${error.message}`);
      results.timing.image_api_ms = Date.now() - imageStart;
    }

    results.timing.total_ms = Date.now() - startTime;

    log.info('PSA API test completed', {
      cert,
      total_ms: results.timing.total_ms,
      has_card_data: !!results.normalized_data.card,
      has_images: !!(results.normalized_data.images?.length),
      error_count: results.errors.length
    });

    return new Response(JSON.stringify({
      ok: true,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    log.error('Admin PSA test error', { error: error.message });
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});