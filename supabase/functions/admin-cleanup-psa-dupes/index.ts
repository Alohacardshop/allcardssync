import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role client to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify admin access using regular client
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError || !roles?.some(r => r.role === 'admin')) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[admin-cleanup-psa-dupes] Admin ${user.id} initiated PSA cert duplicate cleanup`);

    // Find PSA cert duplicates (keeping oldest, deleting newer)
    const { data: items, error: fetchError } = await supabaseAdmin
      .from('intake_items')
      .select('id, psa_cert, created_at, sku, shopify_product_id, store_key')
      .not('psa_cert', 'is', null)
      .neq('psa_cert', '')
      .is('deleted_at', null)
      .order('psa_cert')
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;

    // Group by PSA cert
    const grouped = (items || []).reduce((acc: Record<string, typeof items>, item) => {
      if (!acc[item.psa_cert!]) acc[item.psa_cert!] = [];
      acc[item.psa_cert!].push(item);
      return acc;
    }, {});

    // Find duplicates (groups with more than 1 item)
    const duplicateGroups = Object.entries(grouped).filter(([_, group]) => group.length > 1);

    if (duplicateGroups.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No PSA cert duplicates found',
          deletedCount: 0,
          keptCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let deletedCount = 0;
    let keptCount = 0;
    const results = [];

    for (const [psaCert, group] of duplicateGroups) {
      const [keep, ...toDelete] = group;
      keptCount++;

      console.log(`[admin-cleanup-psa-dupes] PSA cert ${psaCert}: keeping ${keep.id}, deleting ${toDelete.length} duplicate(s)`);

      // Soft delete duplicates using service role (bypasses RLS)
      const deleteIds = toDelete.map(item => item.id);
      const { error: deleteError } = await supabaseAdmin
        .from('intake_items')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_reason: `Duplicate PSA cert ${psaCert} - kept item ${keep.id}`,
          updated_by: 'admin_duplicate_cleanup',
          updated_at: new Date().toISOString(),
        })
        .in('id', deleteIds);

      if (deleteError) {
        console.error(`[admin-cleanup-psa-dupes] Error deleting duplicates for ${psaCert}:`, deleteError);
        results.push({ psaCert, error: deleteError.message, deletedCount: 0 });
      } else {
        deletedCount += toDelete.length;
        results.push({ psaCert, deletedCount: toDelete.length, kept: keep.id });
      }
    }

    console.log(`[admin-cleanup-psa-dupes] Cleanup complete: ${deletedCount} deleted, ${keptCount} kept`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount,
        keptCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[admin-cleanup-psa-dupes] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
