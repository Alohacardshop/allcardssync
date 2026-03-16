import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  removeOutliers,
  fetchEbaySoldListings,
} from '../_shared/ebayPriceCheck.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateSealedSearchQuery(item: any): string {
  if (item.sku && /^\d{10,14}$/.test(item.sku)) {
    return item.sku;
  }
  const parts: string[] = [];
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  return parts.join(' ').trim();
}

async function processItems(supabase: any, appId: string) {
  console.log('[Sealed Price Check] Starting batch processing');

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

      const rawPrices = await fetchEbaySoldListings(searchQuery, appId);

      if (rawPrices.length === 0) {
        console.log(`[Sealed Price Check] No sales found for item ${item.id}`);
        continue;
      }

      const { average, used, outliers } = removeOutliers(rawPrices);
      const currentPrice = item.price || 0;
      const differencePercent = currentPrice > 0 ? ((currentPrice - average) / average) * 100 : 0;

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

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[Sealed Price Check] Error processing item ${item.id}:`, err);
      errors++;
    }
  }

  console.log(`[Sealed Price Check] Completed: ${processed} processed, ${errors} errors`);
  return { totalFound: sealedItems.length, processed, errors, results };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('EBAY_CLIENT_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!clientId) {
      throw new Error('EBAY_CLIENT_ID must be configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Sealed Price Check] Starting nightly sealed product price check');

    const processPromise = processItems(supabase, clientId);

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(processPromise);
      return new Response(
        JSON.stringify({ status: 'started', message: 'Sealed price check started in background' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await processPromise;
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Sealed Price Check] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
