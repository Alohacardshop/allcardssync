import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getEbayOAuthToken,
  removeOutliers,
  fetchEbaySoldListings,
} from '../_shared/ebayPriceCheck.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EbayPriceCheckRequest {
  searchQuery: string;
  itemId: string;
  currentPrice: number;
}

interface EbayPriceCheckResponse {
  ebayAverage: number;
  priceCount: number;
  pricesUsed: number[];
  rawPrices: number[];
  outliersRemoved: number[];
  currentPrice: number;
  differencePercent: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('EBAY_CLIENT_ID');
    const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be configured');
    }

    const { searchQuery, itemId, currentPrice }: EbayPriceCheckRequest = await req.json();

    console.log(`[eBay Price Check] Checking prices for: ${searchQuery}`);

    // Get OAuth token (cached or fresh)
    const oauthToken = await getEbayOAuthToken(clientId, clientSecret);

    // Fetch sold listings from eBay using OAuth
    const rawPrices = await fetchEbaySoldListings(searchQuery, oauthToken);

    if (rawPrices.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No sold listings found on eBay',
          searchQuery,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Remove outliers and calculate average
    const { average, used, outliers } = removeOutliers(rawPrices);

    // Calculate difference percentage
    const differencePercent =
      currentPrice > 0 ? ((currentPrice - average) / average) * 100 : 0;

    const result: EbayPriceCheckResponse = {
      ebayAverage: Math.round(average * 100) / 100,
      priceCount: used.length,
      pricesUsed: used,
      rawPrices,
      outliersRemoved: outliers,
      currentPrice,
      differencePercent: Math.round(differencePercent * 100) / 100,
    };

    // Update the database with the result
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from('intake_items')
      .update({
        ebay_price_check: {
          checked_at: new Date().toISOString(),
          ebay_average: result.ebayAverage,
          price_count: result.priceCount,
          current_price: result.currentPrice,
          difference_percent: result.differencePercent,
          raw_prices: result.rawPrices,
          outliers_removed: result.outliersRemoved,
          prices_used: result.pricesUsed,
          search_query: searchQuery,
        },
      })
      .eq('id', itemId);

    console.log(`[eBay Price Check] Updated item ${itemId} with eBay data`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[eBay Price Check] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
