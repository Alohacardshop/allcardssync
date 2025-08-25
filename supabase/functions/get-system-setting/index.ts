import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Tables: {
      system_settings: {
        Row: {
          id: string
          key_name: string
          key_value: string | null
          description: string | null
          is_encrypted: boolean | null
          category: string | null
          created_at: string
          updated_at: string
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Create Supabase client with service role key for elevated permissions
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

    const { keyName, fallbackSecretName } = await req.json()

    if (!keyName) {
      return new Response(
        JSON.stringify({ error: 'keyName is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Looking up system setting: ${keyName}`)

    // First try to get from system_settings table
    const { data: setting, error } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', keyName)
      .single()

    if (!error && setting?.key_value) {
      console.log(`Found ${keyName} in system_settings`)
      return new Response(
        JSON.stringify({ value: setting.key_value, source: 'system_settings' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Fall back to Supabase secrets if available
    if (fallbackSecretName) {
      console.log(`${keyName} not found in system_settings, trying fallback secret: ${fallbackSecretName}`)
      const secretValue = Deno.env.get(fallbackSecretName)
      
      if (secretValue) {
        console.log(`Found fallback secret: ${fallbackSecretName}`)
        return new Response(
          JSON.stringify({ value: secretValue, source: 'supabase_secrets' }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    console.log(`Neither system setting ${keyName} nor fallback secret ${fallbackSecretName} found`)
    return new Response(
      JSON.stringify({ error: 'Setting not found', keyName, fallbackSecretName }),
      { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in get-system-setting:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})