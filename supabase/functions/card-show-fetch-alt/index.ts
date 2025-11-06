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

    const { certNumber, gradingService, defaults } = await req.json();

    if (!certNumber || !gradingService) {
      return new Response(JSON.stringify({ error: 'Certificate number and grading service required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if credentials are configured
    const { data: credentials } = await supabaseClient
      .from('alt_credentials')
      .select('email, password')
      .single();

    if (!credentials) {
      return new Response(JSON.stringify({ 
        error: 'ALT credentials not configured. Please ask an admin to configure credentials in the Sessions tab.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TODO: Implement Playwright scraping
    // For now, return a placeholder response
    console.log('Certificate lookup request:', { certNumber, gradingService });
    console.log('Credentials exist:', !!credentials);

    // Simulate finding a card (this would be replaced with actual Playwright scraping)
    const mockItem = {
      id: crypto.randomUUID(),
      alt_uuid: `alt_${certNumber}`,
      alt_url: `https://app.alt.xyz/research/item-${certNumber}`,
      title: `${gradingService} ${certNumber} - Card Title`,
      grade: '10',
      grading_service: gradingService,
      set_name: 'Example Set',
      year: '2023',
      population: '1234',
      image_url: null,
      alt_value: 150.00,
      alt_checked_at: new Date().toISOString(),
    };

    // Insert into alt_items
    const { data: insertedItem, error: insertError } = await supabaseClient
      .from('alt_items')
      .upsert({
        alt_uuid: mockItem.alt_uuid,
        alt_url: mockItem.alt_url,
        title: mockItem.title,
        grade: mockItem.grade,
        grading_service: mockItem.grading_service,
        set_name: mockItem.set_name,
        year: mockItem.year,
        population: mockItem.population,
        image_url: mockItem.image_url,
        alt_value: mockItem.alt_value,
        alt_checked_at: mockItem.alt_checked_at,
      }, {
        onConflict: 'alt_uuid',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Create transactions if defaults provided
    if (defaults?.buy && insertedItem) {
      await supabaseClient.from('card_transactions').insert({
        alt_item_id: insertedItem.id,
        txn_type: 'buy',
        price: defaults.buy.price,
        show_id: defaults.buy.showId || null,
        notes: 'Added via certificate lookup',
      });
    }

    if (defaults?.sell && insertedItem) {
      await supabaseClient.from('card_transactions').insert({
        alt_item_id: insertedItem.id,
        txn_type: 'sell',
        price: defaults.sell.price,
        show_id: defaults.sell.showId || null,
        notes: 'Added via certificate lookup',
      });
    }

    return new Response(JSON.stringify({
      success: true,
      item: insertedItem || mockItem,
    }), {
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
