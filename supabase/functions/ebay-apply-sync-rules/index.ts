import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRule {
  id: string;
  store_key: string;
  name: string;
  rule_type: 'include' | 'exclude';
  category_match: string[];
  brand_match: string[];
  min_price: number | null;
  max_price: number | null;
  graded_only: boolean;
  priority: number;
  is_active: boolean;
  auto_queue: boolean;
}

interface IntakeItem {
  id: string;
  brand_title: string | null;
  main_category: string | null;
  sub_category: string | null;
  price: number | null;
  grade: string | null;
  type: string | null;
  list_on_ebay: boolean | null;
  ebay_listing_id: string | null;
  ebay_managed_externally: boolean | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { store_key, dry_run = true } = await req.json();

    if (!store_key) {
      throw new Error('store_key is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch active rules for this store, ordered by priority (highest first)
    const { data: rules, error: rulesError } = await supabase
      .from('ebay_sync_rules')
      .select('*')
      .eq('store_key', store_key)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No active rules found',
        matched_count: 0,
        include_count: 0,
        exclude_count: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch eligible items (not already listed, not externally managed, not deleted)
    const { data: items, error: itemsError } = await supabase
      .from('intake_items')
      .select('id, brand_title, main_category, sub_category, price, grade, type, list_on_ebay, ebay_listing_id, ebay_managed_externally')
      .eq('store_key', store_key)
      .is('deleted_at', null)
      .is('ebay_listing_id', null)
      .or('ebay_managed_externally.is.null,ebay_managed_externally.eq.false');

    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No eligible items found',
        matched_count: 0,
        include_count: 0,
        exclude_count: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process items against rules
    const includeIds: string[] = [];
    const excludeIds: string[] = [];
    const autoQueueIds: string[] = [];

    for (const item of items as IntakeItem[]) {
      let matched = false;
      let matchResult: 'include' | 'exclude' | null = null;
      let shouldAutoQueue = false;

      // Process rules in priority order
      for (const rule of rules as SyncRule[]) {
        if (matchesRule(item, rule)) {
          matched = true;
          matchResult = rule.rule_type;
          shouldAutoQueue = rule.auto_queue;
          break; // First matching rule wins
        }
      }

      if (matched && matchResult) {
        if (matchResult === 'include') {
          includeIds.push(item.id);
          if (shouldAutoQueue) {
            autoQueueIds.push(item.id);
          }
        } else {
          excludeIds.push(item.id);
        }
      }
    }

    // Dry run - just return counts
    if (dry_run) {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        matched_count: includeIds.length + excludeIds.length,
        include_count: includeIds.length,
        exclude_count: excludeIds.length,
        auto_queue_count: autoQueueIds.length,
        include_ids: includeIds.slice(0, 10), // Preview first 10
        exclude_ids: excludeIds.slice(0, 10),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Apply changes
    let updatedCount = 0;

    // Set list_on_ebay = true for included items
    if (includeIds.length > 0) {
      const { error: includeError } = await supabase
        .from('intake_items')
        .update({ list_on_ebay: true })
        .in('id', includeIds);

      if (includeError) {
        console.error('Error updating include items:', includeError);
      } else {
        updatedCount += includeIds.length;
      }
    }

    // Set list_on_ebay = false for excluded items
    if (excludeIds.length > 0) {
      const { error: excludeError } = await supabase
        .from('intake_items')
        .update({ list_on_ebay: false })
        .in('id', excludeIds);

      if (excludeError) {
        console.error('Error updating exclude items:', excludeError);
      } else {
        updatedCount += excludeIds.length;
      }
    }

    // Auto-queue items
    let queuedCount = 0;
    if (autoQueueIds.length > 0) {
      const queueEntries = autoQueueIds.map(id => ({
        inventory_item_id: id,
        action: 'create',
        status: 'queued',
        payload: { store_key, auto_rule: true },
      }));

      const { error: queueError } = await supabase
        .from('ebay_sync_queue')
        .insert(queueEntries);

      if (queueError) {
        console.error('Error queuing items:', queueError);
      } else {
        queuedCount = autoQueueIds.length;
        
        // Update sync status
        await supabase
          .from('intake_items')
          .update({ ebay_sync_status: 'queued' })
          .in('id', autoQueueIds);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: false,
      matched_count: updatedCount,
      include_count: includeIds.length,
      exclude_count: excludeIds.length,
      queued_count: queuedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error applying sync rules:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Check if an item matches a sync rule
 */
function matchesRule(item: IntakeItem, rule: SyncRule): boolean {
  // Category matching
  if (rule.category_match && rule.category_match.length > 0) {
    const itemCategories = [
      item.main_category?.toLowerCase(),
      item.sub_category?.toLowerCase(),
      item.brand_title?.toLowerCase(),
    ].filter(Boolean);

    const hasMatchingCategory = rule.category_match.some(cat => 
      itemCategories.some(itemCat => 
        itemCat?.includes(cat.toLowerCase()) || cat.toLowerCase().includes(itemCat || '')
      )
    );

    if (!hasMatchingCategory) return false;
  }

  // Brand matching
  if (rule.brand_match && rule.brand_match.length > 0) {
    const brandTitle = item.brand_title?.toLowerCase() || '';
    const hasMatchingBrand = rule.brand_match.some(brand => 
      brandTitle.includes(brand.toLowerCase())
    );

    if (!hasMatchingBrand) return false;
  }

  // Price range
  if (rule.min_price !== null && (item.price === null || item.price < rule.min_price)) {
    return false;
  }
  if (rule.max_price !== null && (item.price === null || item.price > rule.max_price)) {
    return false;
  }

  // Graded only
  if (rule.graded_only) {
    const isGraded = item.type?.toLowerCase() === 'graded' || 
                     (item.grade && item.grade.trim() !== '');
    if (!isGraded) return false;
  }

  return true;
}
