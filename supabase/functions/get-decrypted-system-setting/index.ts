import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyName } = await req.json();

    if (!keyName) {
      return new Response(
        JSON.stringify({ error: 'keyName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key
    const supabaseServiceRole = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the current user from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user token to verify permissions
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: roles } = await supabaseServiceRole
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = roles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      console.log(`Non-admin user ${user.id} attempted to decrypt system setting: ${keyName}`);
      return new Response(
        JSON.stringify({ error: 'Admin role required to decrypt system settings' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query the system_settings table
    const { data: setting, error: settingError } = await supabaseServiceRole
      .from('system_settings')
      .select('key_value, is_encrypted')
      .eq('key_name', keyName)
      .single();

    if (settingError || !setting) {
      return new Response(
        JSON.stringify({ error: `System setting '${keyName}' not found` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the access for audit purposes
    await supabaseServiceRole
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Admin decrypted system setting: ${keyName}`,
        context: {
          user_id: user.id,
          key_name: keyName,
          timestamp: new Date().toISOString()
        },
        source: 'get-decrypted-system-setting',
        user_id: user.id
      });

    // Return the decrypted value
    // Note: The system settings are stored with encryption handled by the application layer
    // The key_value should already be the decrypted value when retrieved by service role
    return new Response(
      JSON.stringify({ value: setting.key_value }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-decrypted-system-setting:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});