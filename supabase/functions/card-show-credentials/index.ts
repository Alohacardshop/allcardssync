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

    // Get user and check admin role
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

    const isAdmin = roles?.some((r) => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // GET /card-show-credentials/status - Check if credentials exist
    if (req.method === 'GET' && path.includes('/status')) {
      const { data } = await supabaseClient
        .from('alt_credentials')
        .select('email')
        .single();

      if (data?.email) {
        const email = data.email;
        const masked = email.charAt(0) + '***@' + email.split('@')[1];
        return new Response(JSON.stringify({ 
          configured: true, 
          email_masked: masked 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ configured: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /card-show-credentials - Save credentials
    if (req.method === 'POST' && !path.includes('/test')) {
      const { email, password } = await req.json();

      if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email and password required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete existing credentials
      await supabaseClient.from('alt_credentials').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Insert new credentials
      const { error } = await supabaseClient
        .from('alt_credentials')
        .insert({ email, password });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /card-show-credentials - Clear credentials
    if (req.method === 'DELETE') {
      await supabaseClient.from('alt_credentials').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /card-show-credentials/test - Test credentials
    if (req.method === 'POST' && path.includes('/test')) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Browser automation not available in Edge Functions. Credentials saved but cannot be tested automatically. Use external scraping service for actual lookups.' 
      }), {
        status: 501,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in card-show-credentials:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
