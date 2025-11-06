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

    console.log('Starting Playwright scraping for cert:', certNumber);

    // Launch browser
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();
      console.log('Browser launched, navigating to ALT...');

      // Navigate to ALT login page
      await page.goto('https://app.alt.xyz/login', { waitUntil: 'networkidle' });
      console.log('On login page, checking if already logged in...');

      // Check if we need to login (look for login form)
      const needsLogin = await page.locator('input[type="email"], input[name="email"]').count() > 0;

      if (needsLogin) {
        console.log('Not logged in, performing login...');
        
        // Fill in email
        await page.fill('input[type="email"], input[name="email"]', credentials.email);
        console.log('Email filled');
        
        // Fill in password
        await page.fill('input[type="password"], input[name="password"]', credentials.password);
        console.log('Password filled');
        
        // Click login button
        await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")');
        console.log('Login button clicked, waiting for navigation...');
        
        // Wait for navigation after login
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        console.log('Login completed');
      } else {
        console.log('Already logged in');
      }

      // Navigate to browse page with cert number search
      const searchUrl = `https://app.alt.xyz/browse?query=${encodeURIComponent(certNumber)}`;
      console.log('Navigating to search:', searchUrl);
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for search results
      console.log('Waiting for search results...');
      await page.waitForTimeout(3000); // Give time for results to load

      // Find and click the first result
      const firstResult = page.locator('a[href*="/research/"], a[href*="/item/"], [data-testid="search-result"] a').first();
      const resultCount = await firstResult.count();

      if (resultCount === 0) {
        throw new Error(`No results found for certificate ${certNumber}. The card may not exist in ALT's database.`);
      }

      console.log('Found result, clicking...');
      const itemUrl = await firstResult.getAttribute('href');
      await firstResult.click();
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      console.log('On item detail page, extracting data...');

      // Extract data from detail page
      const itemData = await page.evaluate(() => {
        // Helper to safely get text content
        const getText = (selector: string) => {
          const el = document.querySelector(selector);
          return el?.textContent?.trim() || null;
        };

        // Helper to get image URL
        const getImageUrl = (selector: string) => {
          const img = document.querySelector(selector) as HTMLImageElement;
          return img?.src || null;
        };

        return {
          title: getText('h1, [data-testid="item-title"], .item-title') || 
                 getText('h2') || 
                 document.title,
          
          grade: getText('[data-testid="grade"], .grade, .item-grade') ||
                 getText('*:has-text("Grade:")') ||
                 null,
          
          set_name: getText('[data-testid="set"], .set-name, .item-set') ||
                    getText('*:has-text("Set:")') ||
                    null,
          
          year: getText('[data-testid="year"], .year, .item-year') ||
                getText('*:has-text("Year:")') ||
                null,
          
          population: getText('[data-testid="population"], .population, .pop-report') ||
                      getText('*:has-text("Population:")') ||
                      null,
          
          alt_value: getText('[data-testid="value"], .value, .market-value') ||
                     getText('*:has-text("Value:")') ||
                     getText('*:has-text("$")') ||
                     null,
          
          image_url: getImageUrl('[data-testid="item-image"], .item-image img, .card-image img') ||
                     getImageUrl('img[alt*="card"], img[alt*="Card"]') ||
                     null,
        };
      });

      console.log('Extracted data:', itemData);

      // Get current page URL as item URL
      const finalItemUrl = page.url();
      
      // Parse and clean the data
      const cleanValue = (str: string | null) => {
        if (!str) return null;
        return str.replace(/[^0-9.]/g, '');
      };

      const altValue = itemData.alt_value ? parseFloat(cleanValue(itemData.alt_value) || '0') : null;
      const grade = itemData.grade?.match(/\d+/)?.[0] || null;

      // Generate UUID from cert number for consistency
      const altUuid = `${gradingService.toLowerCase()}_${certNumber}`;

      const scrapedItem = {
        alt_uuid: altUuid,
        alt_url: finalItemUrl,
        title: itemData.title || `${gradingService} ${certNumber}`,
        grade: grade || '0',
        grading_service: gradingService,
        set_name: itemData.set_name,
        year: itemData.year,
        population: itemData.population,
        image_url: itemData.image_url,
        alt_value: altValue,
        alt_checked_at: new Date().toISOString(),
        alt_notes: `Scraped from ALT on ${new Date().toISOString()}`,
      };

      console.log('Final scraped item:', scrapedItem);

      // Insert into alt_items
      const { data: insertedItem, error: insertError } = await supabaseClient
        .from('alt_items')
        .upsert(scrapedItem, {
          onConflict: 'alt_uuid',
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      console.log('Item inserted:', insertedItem.id);

      // Create transactions if defaults provided
      if (defaults?.buy && insertedItem) {
        await supabaseClient.from('card_transactions').insert({
          alt_item_id: insertedItem.id,
          txn_type: 'buy',
          price: defaults.buy.price,
          show_id: defaults.buy.showId || null,
          notes: 'Added via certificate lookup',
        });
        console.log('Buy transaction created');
      }

      if (defaults?.sell && insertedItem) {
        await supabaseClient.from('card_transactions').insert({
          alt_item_id: insertedItem.id,
          txn_type: 'sell',
          price: defaults.sell.price,
          show_id: defaults.sell.showId || null,
          notes: 'Added via certificate lookup',
        });
        console.log('Sell transaction created');
      }

      return new Response(JSON.stringify({
        success: true,
        item: insertedItem,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } finally {
      await browser.close();
      console.log('Browser closed');
    }

  } catch (error) {
    console.error('Error in card-show-fetch-alt:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
