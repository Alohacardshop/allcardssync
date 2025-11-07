import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get user and check staff role
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isStaffOrAdmin = roles?.some((r) => r.role === 'staff' || r.role === 'admin');
    if (!isStaffOrAdmin) {
      return new Response(JSON.stringify({ error: 'Staff or admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { certNumber, defaults } = await req.json();

    if (!certNumber) {
      return new Response(JSON.stringify({ error: 'Certificate number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get PSA API token
    const psaToken = Deno.env.get('PSA_PUBLIC_API_TOKEN');
    if (!psaToken) {
      console.error('[card-show-fetch-alt] PSA API token not configured');
      return new Response(JSON.stringify({ 
        error: 'PSA API token not configured. Please ask an admin to add PSA_PUBLIC_API_TOKEN in Supabase secrets.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[card-show-fetch-alt] Fetching cert ${certNumber} from PSA API`);

    // Fetch from PSA API (much faster than scraping)
    const certUrl = `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`;
    const imagesUrl = `https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${certNumber}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const [certResponse, imagesResponse] = await Promise.all([
        fetch(certUrl, {
          headers: {
            'authorization': `bearer ${psaToken}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        }),
        fetch(imagesUrl, {
          headers: {
            'authorization': `bearer ${psaToken}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        }).catch(() => null) // Images are optional
      ]);

      clearTimeout(timeoutId);

      if (!certResponse.ok) {
        console.error(`[card-show-fetch-alt] PSA API error: ${certResponse.status} ${certResponse.statusText}`);
        return new Response(JSON.stringify({ 
          error: `Failed to fetch from PSA API: ${certResponse.statusText}` 
        }), {
          status: certResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const certData = await certResponse.json();
      const imagesData = imagesResponse?.ok ? await imagesResponse.json() : null;

      console.log(`[card-show-fetch-alt] PSA API response received for cert ${certNumber}`);

      // Validate certificate data
      if (!certData?.PSACert?.CertNumber) {
        console.warn('[card-show-fetch-alt] No valid certificate data');
        return new Response(JSON.stringify({ 
          error: 'Certificate not found or invalid' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const psaCert = certData.PSACert;
      
      // Extract image URL from images data
      let imageUrl = null;
      if (imagesData && Array.isArray(imagesData) && imagesData.length > 0) {
        // Find FrontImage
        const frontImage = imagesData.find((img: any) => img.ImageType === 'FrontImage');
        imageUrl = frontImage?.ImageURL || imagesData[0]?.ImageURL || null;
      }

      // Build card title from PSA data
      const year = psaCert.Year || '';
      const brand = psaCert.Brand || '';
      const subject = psaCert.Subject || '';
      const cardNumber = psaCert.CardNumber || '';
      const title = `${year} ${brand} ${subject} ${cardNumber}`.trim() || `PSA ${certNumber}`;

      // Parse grade
      const grade = psaCert.CardGrade?.toString() || null;

      const cardData = {
        alt_uuid: `PSA-${certNumber}`,
        alt_url: `https://www.psacard.com/cert/${certNumber}`,
        title,
        grade,
        grading_service: 'PSA',
        set_name: psaCert.Category || null,
        image_url: imageUrl,
        alt_value: null, // PSA API doesn't provide value
        population: null,
        alt_checked_at: new Date().toISOString(),
      };

      const { data: altItem, error: insertError } = await supabaseClient
        .from('alt_items')
        .upsert(cardData, { onConflict: 'alt_uuid' })
        .select()
        .single();

      if (insertError) {
        console.error(`[card-show-fetch-alt] Error saving card:`, insertError.message);
        return new Response(JSON.stringify({ error: 'Failed to save card data' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If defaults were provided (buy/sell prices), create transactions
      if (defaults?.buy || defaults?.sell) {
        const transactions = [];
        
        if (defaults.buy) {
          transactions.push({
            alt_item_id: altItem.id,
            show_id: defaults.buy.showId,
            txn_type: 'BUY',
            price: defaults.buy.price,
            txn_date: new Date().toISOString(),
          });
        }
        
        if (defaults.sell) {
          transactions.push({
            alt_item_id: altItem.id,
            show_id: defaults.sell.showId,
            txn_type: 'SELL',
            price: defaults.sell.price,
            txn_date: new Date().toISOString(),
          });
        }

        if (transactions.length > 0) {
          const { error: txnError } = await supabaseClient
            .from('card_transactions')
            .insert(transactions);
          
          if (txnError) {
            console.warn(`[card-show-fetch-alt] Error saving transactions:`, txnError);
          }
        }
      }

      console.log(`[card-show-fetch-alt] Successfully saved card for cert ${certNumber}`);

      return new Response(JSON.stringify({ 
        success: true,
        cards: [altItem],
        count: 1
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('[card-show-fetch-alt] PSA API request timed out after 15 seconds');
        return new Response(JSON.stringify({ 
          error: 'Request timed out. PSA API might be slow or unreachable.' 
        }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error(`[card-show-fetch-alt] Error fetching from PSA API:`, error.message);
      throw error;
    }

  } catch (error) {
    console.error('Error in card-show-fetch-alt:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
