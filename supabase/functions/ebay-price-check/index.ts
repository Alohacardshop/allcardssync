import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function removeOutliers(prices: number[]): {
  average: number;
  used: number[];
  outliers: number[];
} {
  if (prices.length <= 3) {
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    return { average, used: prices, outliers: [] };
  }

  // Calculate initial average
  const initialAvg = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Remove outliers (±30%)
  const threshold = initialAvg * 0.30;
  const filtered = prices.filter(p =>
    p >= (initialAvg - threshold) &&
    p <= (initialAvg + threshold)
  );

  // Keep at least 3 prices
  const usedPrices = filtered.length >= 3 ? filtered : prices.slice(0, 3);
  const outliers = prices.filter(p => !usedPrices.includes(p));

  const finalAvg = usedPrices.reduce((a, b) => a + b, 0) / usedPrices.length;

  return { average: finalAvg, used: usedPrices, outliers };
}

async function fetchEbaySoldListings(searchQuery: string, ebayApiKey: string): Promise<number[]> {
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': ebayApiKey,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    'keywords': searchQuery,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'itemFilter(1).name': 'ListingType',
    'itemFilter(1).value': 'FixedPrice',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '10',
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`eBay API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Extract sold prices from response
  const searchResult = data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
  if (!searchResult || searchResult['@count'] === '0') {
    return [];
  }

  const items = searchResult.item || [];
  const prices: number[] = [];

  for (const item of items) {
    const sellingStatus = item.sellingStatus?.[0];
    if (sellingStatus?.sellingState?.[0] === 'EndedWithSales') {
      const priceValue = sellingStatus.currentPrice?.[0]?.__value__;
      if (priceValue) {
        prices.push(parseFloat(priceValue));
      }
    }
  }

  return prices;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ebayApiKey = Deno.env.get('EBAY_API_KEY');
    if (!ebayApiKey) {
      throw new Error('EBAY_API_KEY not configured');
    }

    const { searchQuery, itemId, currentPrice }: EbayPriceCheckRequest = await req.json();

    console.log(`[eBay Price Check] Checking prices for: ${searchQuery}`);

    // Fetch sold listings from eBay
    const rawPrices = await fetchEbaySoldListings(searchQuery, ebayApiKey);

    if (rawPrices.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No sold listings found on eBay',
          searchQuery 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Remove outliers and calculate average
    const { average, used, outliers } = removeOutliers(rawPrices);

    // Calculate difference percentage
    const differencePercent = currentPrice > 0 
      ? ((currentPrice - average) / average) * 100 
      : 0;

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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
