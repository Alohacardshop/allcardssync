import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayOAuthToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    console.log('[eBay OAuth] Using cached token');
    return cachedToken.token;
  }

  console.log('[eBay OAuth] Fetching new token');
  const credentials = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[eBay OAuth] Token request failed:', response.status, errorText);
    throw new Error(`OAuth token request failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in - 300) * 1000)
  };
  
  console.log('[eBay OAuth] New token cached');
  return data.access_token;
}

function removeOutliers(prices: number[]): {
  average: number;
  used: number[];
  outliers: number[];
} {
  if (prices.length === 0) {
    return { average: 0, used: [], outliers: [] };
  }
  
  if (prices.length <= 3) {
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    return { average, used: prices, outliers: [] };
  }

  const initialAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const threshold = initialAvg * 0.30;
  
  const filtered = prices.filter(p =>
    p >= (initialAvg - threshold) &&
    p <= (initialAvg + threshold)
  );

  const usedPrices = filtered.length >= 3 ? filtered : prices.slice(0, 3);
  const outliers = prices.filter(p => !usedPrices.includes(p));
  const finalAvg = usedPrices.reduce((a, b) => a + b, 0) / usedPrices.length;

  return { average: finalAvg, used: usedPrices, outliers };
}

async function fetchEbaySoldListings(searchQuery: string, oauthToken: string): Promise<number[]> {
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    'keywords': searchQuery,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'itemFilter(1).name': 'ListingType',
    'itemFilter(1).value': 'FixedPrice',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '5',
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${oauthToken}`,
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[eBay API] Request failed:', response.status, errorText);
    throw new Error(`eBay API error: ${response.statusText}`);
  }

  const data = await response.json();
  
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

// Generate search query for sealed products - prioritize barcode/UPC
function generateSealedSearchQuery(item: any): string {
  // If SKU looks like a barcode (10-14 digits), use it directly
  if (item.sku && /^\d{10,14}$/.test(item.sku)) {
    return item.sku;
  }
  
  // Fall back to product name
  const parts: string[] = [];
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  
  return parts.join(' ').trim();
}

async function processItems(supabase: any, oauthToken: string) {
  console.log('[Sealed Price Check] Starting batch processing');
  
  // Query sealed items with quantity > 1
  const { data: items, error } = await supabase
    .from('intake_items')
    .select('id, sku, brand_title, subject, price, shopify_snapshot')
    .gt('quantity', 1)
    .is('deleted_at', null)
    .limit(500);

  if (error) {
    console.error('[Sealed Price Check] Query error:', error);
    throw error;
  }

  // Filter for sealed items (check tags in shopify_snapshot)
  const sealedItems = (items || []).filter((item: any) => {
    const tags = item.shopify_snapshot?.tags || '';
    return tags.toLowerCase().includes('sealed');
  });

  console.log(`[Sealed Price Check] Found ${sealedItems.length} sealed items with quantity > 1`);

  let processed = 0;
  let errors = 0;
  const results: any[] = [];

  for (const item of sealedItems) {
    try {
      const searchQuery = generateSealedSearchQuery(item);
      
      if (!searchQuery) {
        console.log(`[Sealed Price Check] Skipping item ${item.id} - no search query`);
        continue;
      }

      console.log(`[Sealed Price Check] Checking item ${item.id}: "${searchQuery}"`);
      
      const rawPrices = await fetchEbaySoldListings(searchQuery, oauthToken);
      
      if (rawPrices.length === 0) {
        console.log(`[Sealed Price Check] No sales found for item ${item.id}`);
        continue;
      }

      const { average, used, outliers } = removeOutliers(rawPrices);
      const currentPrice = item.price || 0;
      const differencePercent = currentPrice > 0 
        ? ((currentPrice - average) / average) * 100 
        : 0;

      // Update the database
      await supabase
        .from('intake_items')
        .update({
          ebay_price_check: {
            checked_at: new Date().toISOString(),
            ebay_average: Math.round(average * 100) / 100,
            price_count: used.length,
            current_price: currentPrice,
            difference_percent: Math.round(differencePercent * 100) / 100,
            raw_prices: rawPrices,
            outliers_removed: outliers,
            prices_used: used,
            search_query: searchQuery,
          },
        })
        .eq('id', item.id);

      processed++;
      results.push({
        itemId: item.id,
        searchQuery,
        ebayAverage: Math.round(average * 100) / 100,
        currentPrice,
        differencePercent: Math.round(differencePercent * 100) / 100,
      });

      // Rate limiting: 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.error(`[Sealed Price Check] Error processing item ${item.id}:`, err);
      errors++;
    }
  }

  console.log(`[Sealed Price Check] Completed: ${processed} processed, ${errors} errors`);
  
  return {
    totalFound: sealedItems.length,
    processed,
    errors,
    results,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('EBAY_CLIENT_ID');
    const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!clientId || !clientSecret) {
      throw new Error('EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const oauthToken = await getEbayOAuthToken(clientId, clientSecret);

    console.log('[Sealed Price Check] Starting nightly sealed product price check');

    // Run processing in background
    const processPromise = processItems(supabase, oauthToken);
    
    // Use waitUntil if available (Supabase Edge Runtime)
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(processPromise);
      
      return new Response(
        JSON.stringify({ 
          status: 'started',
          message: 'Sealed price check started in background' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback: wait for completion
    const result = await processPromise;
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[Sealed Price Check] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
