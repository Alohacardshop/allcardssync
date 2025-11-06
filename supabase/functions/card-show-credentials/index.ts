import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chromium } from "https://deno.land/x/playwright@1.40.0/index.ts";

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
      const { data } = await supabaseClient
        .from('alt_credentials')
        .select('email, password')
        .single();

      if (!data) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'No credentials configured' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Testing ALT login with stored credentials...');

      // Actually test the login with Playwright
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        const page = await context.newPage();
        console.log('Navigating to ALT login...');

        await page.goto('https://app.alt.xyz/login', { waitUntil: 'networkidle', timeout: 15000 });
        console.log('On login page');

        // Fill credentials
        await page.fill('input[type="email"], input[name="email"]', data.email);
        await page.fill('input[type="password"], input[name="password"]', data.password);
        console.log('Credentials filled, submitting...');

        // Click login button
        await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")');
        
        // Wait for navigation
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        const currentUrl = page.url();
        console.log('After login, URL:', currentUrl);

        // Check if we're still on login page (failed) or redirected (success)
        const loginFailed = currentUrl.includes('/login') || await page.locator('input[type="email"]').count() > 0;

        if (loginFailed) {
          // Check for error message
          const errorMsg = await page.locator('.error, [role="alert"], .alert-error').textContent().catch(() => null);
          
          return new Response(JSON.stringify({ 
            success: false, 
            message: errorMsg || 'Login failed - invalid credentials or CAPTCHA required' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update session status
        await supabaseClient
          .from('scrape_sessions')
          .upsert({
            service: 'ALT',
            status: 'ready',
            last_login_at: new Date().toISOString(),
            last_cookie_refresh_at: new Date().toISOString(),
            message: 'Successfully tested login credentials',
          }, {
            onConflict: 'service',
          });

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Login successful! Credentials are valid.' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('Login test error:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          message: `Login test failed: ${error.message}` 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } finally {
        await browser.close();
        console.log('Browser closed');
      }
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
