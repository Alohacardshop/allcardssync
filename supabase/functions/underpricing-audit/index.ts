import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getEbayOAuthToken,
  fetchEbaySoldListings,
} from '../_shared/ebayPriceCheck.ts';
import {
  getRegionDiscordConfig,
} from '../_shared/discord-helpers.ts';

/**
 * Underpricing Audit v1
 *
 * Runs daily against active inventory. For each item:
 * 1. Build a search query from the item title (generateTitle logic inline)
 * 2. Fetch recent eBay sold listings
 * 3. Calculate median, reject weak/noisy sets
 * 4. Flag if our price is significantly under market
 * 5. Send a Discord digest and upsert alert records
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Thresholds ──
const MIN_SOLD_MATCHES = 3;
const UNDERPRICE_PERCENT_THRESHOLD = 25; // must be ≥25% below comps
const UNDERPRICE_DOLLAR_THRESHOLD = 15;  // AND ≥$15 below comps
const ALERT_COOLDOWN_DAYS = 7;           // don't re-alert same item within 7 days
const MAX_ITEMS_PER_RUN = 150;           // limit per run to stay within edge fn time
const RATE_LIMIT_MS = 1200;              // 1.2s between eBay API calls

// ── Helpers ──

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Remove outliers beyond ±40% of the median */
function filterOutliers(prices: number[]): number[] {
  if (prices.length <= 3) return prices;
  const med = median(prices);
  const threshold = med * 0.4;
  const filtered = prices.filter(p => p >= med - threshold && p <= med + threshold);
  return filtered.length >= MIN_SOLD_MATCHES ? filtered : prices;
}

/** Build a normalized search query from item fields */
function buildSearchQuery(item: any): string {
  const parts: string[] = [];

  if (item.year) parts.push(String(item.year));
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  if (item.card_number) parts.push(`#${item.card_number}`);

  // Append grading info for graded items
  const isGraded = item.grade && (item.psa_cert || item.cgc_cert || item.type === 'Graded');
  if (isGraded && item.grade) {
    const company = item.grading_company || 'PSA';
    parts.push(`${company} ${item.grade}`);
  }

  // Deduplicate words
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const part of parts) {
    for (const word of part.split(/\s+/)) {
      const lower = word.toLowerCase();
      if (!seen.has(lower) && word.trim()) {
        seen.add(lower);
        deduped.push(word);
      }
    }
  }

  return deduped.join(' ').trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const clientId = Deno.env.get('EBAY_CLIENT_ID');
  const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('[Underpricing Audit] Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET');
    return new Response(JSON.stringify({ error: 'eBay credentials not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('[Underpricing Audit] Starting daily run...');

    // 1. Get OAuth token
    const oauthToken = await getEbayOAuthToken(clientId, clientSecret);

    // 2. Get cutoff for cooldown
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - ALERT_COOLDOWN_DAYS);

    // 3. Fetch active inventory items with price > 0, not deleted, not sold
    const { data: items, error: itemsError } = await supabase
      .from('intake_items')
      .select('id, sku, price, year, brand_title, subject, card_number, grade, grading_company, psa_cert, cgc_cert, type, main_category, variant')
      .is('deleted_at', null)
      .is('sold_at', null)
      .gt('price', 0)
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS_PER_RUN);

    if (itemsError) {
      throw new Error(`Failed to fetch items: ${itemsError.message}`);
    }

    if (!items || items.length === 0) {
      console.log('[Underpricing Audit] No active items found');
      return new Response(JSON.stringify({ message: 'No items to audit', flagged: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Get recently alerted items (within cooldown)
    const { data: recentAlerts } = await supabase
      .from('underpricing_alerts')
      .select('intake_item_id, alerted_at')
      .gte('alerted_at', cooldownDate.toISOString());

    const alertedIds = new Set((recentAlerts || []).map((a: any) => a.intake_item_id));

    // Filter out recently alerted items
    const candidates = items.filter((item: any) => !alertedIds.has(item.id));
    console.log(`[Underpricing Audit] ${items.length} items total, ${candidates.length} after cooldown filter`);

    // 5. Process each candidate
    interface FlaggedItem {
      id: string;
      sku: string;
      searchQuery: string;
      ourPrice: number;
      ebayMedian: number;
      matchCount: number;
      diffPercent: number;
      diffDollars: number;
      isGraded: boolean;
    }

    const flagged: FlaggedItem[] = [];
    let checked = 0;
    let skipped = 0;
    let noResults = 0;
    let weakSets = 0;

    for (const item of candidates) {
      const searchQuery = buildSearchQuery(item);
      if (!searchQuery || searchQuery.length < 5) {
        skipped++;
        continue;
      }

      try {
        const rawPrices = await fetchEbaySoldListings(searchQuery, oauthToken);
        checked++;

        if (rawPrices.length < MIN_SOLD_MATCHES) {
          if (rawPrices.length === 0) noResults++;
          else weakSets++;
          continue;
        }

        // Filter outliers and compute median
        const cleaned = filterOutliers(rawPrices);
        const ebayMedian = median(cleaned);

        if (ebayMedian <= 0) continue;

        const ourPrice = item.price;
        const diffDollars = ebayMedian - ourPrice;
        const diffPercent = (diffDollars / ebayMedian) * 100;

        // Check both thresholds
        if (diffPercent >= UNDERPRICE_PERCENT_THRESHOLD && diffDollars >= UNDERPRICE_DOLLAR_THRESHOLD) {
          const isGraded = !!(item.grade && (item.psa_cert || item.cgc_cert || item.type === 'Graded'));
          flagged.push({
            id: item.id,
            sku: item.sku || 'N/A',
            searchQuery,
            ourPrice,
            ebayMedian: Math.round(ebayMedian * 100) / 100,
            matchCount: cleaned.length,
            diffPercent: Math.round(diffPercent * 10) / 10,
            diffDollars: Math.round(diffDollars * 100) / 100,
            isGraded,
          });
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
      } catch (err) {
        console.error(`[Underpricing Audit] Error checking item ${item.id}:`, err);
      }
    }

    console.log(`[Underpricing Audit] Checked: ${checked}, Flagged: ${flagged.length}, No results: ${noResults}, Weak sets: ${weakSets}, Skipped: ${skipped}`);

    // 6. Upsert alert records
    if (flagged.length > 0) {
      const upsertRows = flagged.map(f => ({
        intake_item_id: f.id,
        sku: f.sku,
        our_price: f.ourPrice,
        ebay_median: f.ebayMedian,
        difference_percent: f.diffPercent,
        difference_dollars: f.diffDollars,
        match_count: f.matchCount,
        search_query: f.searchQuery,
        alerted_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('underpricing_alerts')
        .upsert(upsertRows, { onConflict: 'intake_item_id' });

      if (upsertError) {
        console.error('[Underpricing Audit] Upsert error:', upsertError);
      }
    }

    // 7. Send Discord report
    if (flagged.length > 0) {
      await sendDiscordReport(supabase, flagged, checked, noResults, weakSets, skipped);
    } else {
      console.log('[Underpricing Audit] No underpriced items found, skipping Discord report');
    }

    return new Response(JSON.stringify({
      message: 'Audit complete',
      checked,
      flagged: flagged.length,
      noResults,
      weakSets,
      skipped,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Underpricing Audit] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Discord Report ──

async function sendDiscordReport(
  supabase: any,
  flagged: Array<{
    id: string;
    sku: string;
    searchQuery: string;
    ourPrice: number;
    ebayMedian: number;
    matchCount: number;
    diffPercent: number;
    diffDollars: number;
    isGraded: boolean;
  }>,
  checked: number,
  noResults: number,
  weakSets: number,
  skipped: number,
) {
  // Send to all configured regions
  for (const regionId of ['hawaii', 'las_vegas']) {
    const config = await getRegionDiscordConfig(supabase, regionId);
    if (!config?.enabled || !config.webhookUrl) continue;

    // Build embed fields (max 25 per embed, Discord limit)
    const itemFields = flagged.slice(0, 20).map(f => {
      const badge = f.isGraded ? '🏆' : '🃏';
      const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(f.searchQuery)}&LH_Sold=1&LH_Complete=1`;
      return {
        name: `${badge} ${f.searchQuery.slice(0, 60)}`,
        value: [
          `SKU: \`${f.sku}\``,
          `Our Price: **$${f.ourPrice.toFixed(2)}** → eBay Median: **$${f.ebayMedian.toFixed(2)}**`,
          `Gap: **-$${f.diffDollars.toFixed(2)}** (${f.diffPercent.toFixed(1)}% under) · ${f.matchCount} comps`,
          `[View Sold Comps](${ebaySearchUrl})`,
        ].join('\n'),
        inline: false,
      };
    });

    const embed = {
      title: '📉 Daily Underpricing Audit',
      description: [
        `Found **${flagged.length}** potentially underpriced item${flagged.length === 1 ? '' : 's'}.`,
        '',
        `Items checked: ${checked} · No results: ${noResults} · Weak sets: ${weakSets} · Skipped: ${skipped}`,
        '',
        '⚠️ *Title-based comp estimate — not an exact pricing match. Review manually before repricing.*',
      ].join('\n'),
      color: 0xff6b35, // orange
      fields: itemFields,
      footer: {
        text: `Underpricing Audit v1 · ${new Date().toLocaleDateString('en-US', { timeZone: 'Pacific/Honolulu' })}`,
      },
      timestamp: new Date().toISOString(),
    };

    // If more than 20 flagged items
    if (flagged.length > 20) {
      embed.description += `\n\n_… and ${flagged.length - 20} more. Check the dashboard for the full list._`;
    }

    const mention = config.roleId ? `<@&${config.roleId}>` : '';

    try {
      const resp = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: mention ? `${mention} 📉 Underpricing audit found ${flagged.length} item(s) to review` : '',
          embeds: [embed],
          allowed_mentions: { parse: ['roles'] },
        }),
      });

      if (!resp.ok) {
        console.error(`[Underpricing Audit] Discord ${regionId} error:`, resp.status, await resp.text());
      } else {
        console.log(`[Underpricing Audit] Discord report sent to ${regionId}`);
      }
    } catch (err) {
      console.error(`[Underpricing Audit] Discord ${regionId} send error:`, err);
    }
  }
}
