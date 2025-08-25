import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Try to get API key from system settings first
    console.log('Checking system settings for PRINTNODE_API_KEY...')
    
    const { data, error } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'PRINTNODE_API_KEY',
        fallbackSecretName: 'PRINTNODE_API_KEY'
      }
    })

    if (error) {
      console.error('Error calling get-system-setting:', error)
      throw new Error('Failed to retrieve PrintNode API key')
    }

    if (data?.value) {
      console.log(`Successfully retrieved PrintNode API key from ${data.source}`)
      return new Response(
        JSON.stringify({ 
          apiKey: data.value,
          keySource: data.source,
          success: true 
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      )
    }

    // If primary key not found, try backup
    console.log('Primary key not found, trying backup...')
    
    const backupResponse = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'PRINTNODE_API_KEY_BACKUP',
        fallbackSecretName: 'PRINTNODE_API_KEY_BACKUP'
      }
    })

    if (backupResponse.data?.value) {
      console.log(`Successfully retrieved PrintNode API key from backup ${backupResponse.data.source}`)
      return new Response(
        JSON.stringify({ 
          apiKey: backupResponse.data.value,
          keySource: `backup_${backupResponse.data.source}`,
          success: true 
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      )
    }
    
    console.error('Neither primary nor backup PrintNode API keys found')
    throw new Error('PrintNode API key not configured - check both PRINTNODE_API_KEY and PRINTNODE_API_KEY_BACKUP settings')
    
  } catch (error) {
    console.error('Get PrintNode key error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to get API key',
        success: false
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})