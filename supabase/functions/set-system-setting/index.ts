import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface SetSystemSettingRequest {
  keyName: string
  keyValue: string
  description?: string
  category?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { keyName, keyValue, description, category }: SetSystemSettingRequest = await req.json()

    if (!keyName || !keyValue) {
      return new Response(
        JSON.stringify({ error: 'keyName and keyValue are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if the setting already exists
    const { data: existingSetting } = await supabaseClient
      .from('system_settings')
      .select('id')
      .eq('key_name', keyName)
      .single()

    let result
    if (existingSetting) {
      // Update existing setting
      result = await supabaseClient
        .from('system_settings')
        .update({
          key_value: keyValue,
          updated_at: new Date().toISOString(),
          ...(description && { description }),
          ...(category && { category })
        })
        .eq('key_name', keyName)
        .select()
        .single()
    } else {
      // Insert new setting
      result = await supabaseClient
        .from('system_settings')
        .insert({
          key_name: keyName,
          key_value: keyValue,
          description: description || null,
          category: category || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
    }

    if (result.error) {
      console.error('Database error:', result.error)
      return new Response(
        JSON.stringify({ error: result.error.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Setting saved successfully',
        data: result.data 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})