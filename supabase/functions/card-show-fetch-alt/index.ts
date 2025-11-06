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

    // Get ScrapingBee API key
    const scrapingBeeKey = Deno.env.get('SCRAPING_BEE_API_KEY');
    if (!scrapingBeeKey) {
      return new Response(JSON.stringify({ 
        error: 'ScrapingBee API key not configured. Please ask an admin to add SCRAPING_BEE_API_KEY in Supabase secrets.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Construct ALT URL - ALT auto-detects grading service from cert number
    const altUrl = `https://app.alt.xyz/cert/${certNumber}`;
    
    console.log(`[card-show-fetch-alt] Fetching cert ${certNumber} from ALT via ScrapingBee`);

    // Call ScrapingBee to render the page
    const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeKey}&url=${encodeURIComponent(altUrl)}&render_js=true&premium_proxy=true&country_code=us`;
    
    const response = await fetch(scrapingBeeUrl);
    
    if (!response.ok) {
      console.error(`[card-show-fetch-alt] ScrapingBee error: ${response.status} ${response.statusText}`);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch from ALT: ${response.statusText}` 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();
    console.log(`[card-show-fetch-alt] Received HTML, length: ${html.length}`);

    // Parse HTML to extract card details
    // ALT structure typically has:
    // - Title in h1 or card title element
    // - Grade badge/label
    // - Grading service (PSA, BGS, CGC, SGC)
    // - Image URL
    // - ALT value/price
    // - Population data
    
    // Simple regex-based parsing (you may need to adjust based on ALT's actual HTML structure)
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                      html.match(/class="[^"]*card[_-]?title[^"]*"[^>]*>([^<]+)</i);
    const title = titleMatch ? titleMatch[1].trim() : `Card ${certNumber}`;

    // Grade extraction - look for grade badge or label
    const gradeMatch = html.match(/grade["\s:]+(\d+(?:\.\d+)?)/i) ||
                      html.match(/>\s*(\d+(?:\.\d+)?)\s*<\/.*grade/i);
    const grade = gradeMatch ? gradeMatch[1] : null;

    // Grading service - PSA, BGS, CGC, SGC
    const serviceMatch = html.match(/(PSA|BGS|CGC|SGC)/i);
    const gradingService = serviceMatch ? serviceMatch[1].toUpperCase() : 'PSA';

    // Image URL
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+card[^"']+)["']/i) ||
                    html.match(/<img[^>]+src=["'](https:\/\/[^"']+\.(jpg|jpeg|png|webp))["']/i);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    // ALT value/price
    const valueMatch = html.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    const altValue = valueMatch ? parseFloat(valueMatch[1].replace(/,/g, '')) : null;

    // Set name extraction
    const setMatch = html.match(/set["\s:]+([^<"]+)/i) ||
                    html.match(/series["\s:]+([^<"]+)/i);
    const setName = setMatch ? setMatch[1].trim() : null;

    // Population
    const popMatch = html.match(/population["\s:]+(\d+)/i);
    const population = popMatch ? parseInt(popMatch[1]) : null;

    console.log(`[card-show-fetch-alt] Parsed: ${title}, ${gradingService} ${grade}, $${altValue}`);

    // Save to alt_items table
    const altItemData = {
      alt_uuid: certNumber, // Using cert number as unique identifier
      alt_url: altUrl,
      title: title,
      grade: grade,
      grading_service: gradingService,
      set_name: setName,
      image_url: imageUrl,
      alt_value: altValue,
      population: population,
      alt_checked_at: new Date().toISOString(),
    };

    const { data: altItem, error: insertError } = await supabaseClient
      .from('alt_items')
      .upsert(altItemData, { onConflict: 'alt_uuid' })
      .select()
      .single();

    if (insertError) {
      console.error('[card-show-fetch-alt] Error saving to alt_items:', insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
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
          console.warn('[card-show-fetch-alt] Error saving transactions:', txnError);
        }
      }
    }

    console.log(`[card-show-fetch-alt] Successfully saved card ${certNumber}`);

    return new Response(JSON.stringify({ 
      success: true,
      card: altItem
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in card-show-fetch-alt:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
