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

    const { certNumber, defaults } = await req.json();

    if (!certNumber) {
      return new Response(JSON.stringify({ error: 'Certificate number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get ScrapingBee API key
    const scrapingBeeKey = Deno.env.get('SCRAPING_BEE_API_KEY');
    if (!scrapingBeeKey) {
      return new Response(JSON.stringify({ 
        error: 'ScrapingBee API key not configured. Please ask an admin to add SCRAPING_BEE_API_KEY in Supabase secrets.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Construct ALT URL - ALT auto-detects grading service from cert number
    const altUrl = `https://app.alt.xyz/cert/${certNumber}`;
    
    console.log(`[card-show-fetch-alt] Fetching cert ${certNumber} from ALT via ScrapingBee`);

    // Call ScrapingBee with simplified parameters (no wait_for to avoid timeouts)
    const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeKey}&url=${encodeURIComponent(altUrl)}&render_js=true&premium_proxy=true&country_code=us&wait=3000`;
    
    console.log(`[card-show-fetch-alt] ScrapingBee URL: ${scrapingBeeUrl.replace(scrapingBeeKey, 'REDACTED')}`);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout
    
    try {
      var response = await fetch(scrapingBeeUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      console.log(`[card-show-fetch-alt] ScrapingBee response status: ${response.status}`);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('[card-show-fetch-alt] ScrapingBee request timed out after 45 seconds');
        return new Response(JSON.stringify({ 
          error: 'Request timed out. ALT might be slow or unreachable.' 
        }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error(`[card-show-fetch-alt] Fetch error: ${error.message}`);
      throw error;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[card-show-fetch-alt] ScrapingBee error: ${response.status} ${response.statusText}`);
      console.error(`[card-show-fetch-alt] Error details: ${errorText}`);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch from ALT: ${response.statusText}`,
        details: errorText.substring(0, 200) // Include first 200 chars of error
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();
    console.log(`[card-show-fetch-alt] Received HTML, length: ${html.length}`);

    // Parse HTML to extract multiple cards
    const cards = [];
    
    // Strategy 1: Look for multiple card containers (div with card-related classes)
    const cardContainerRegex = /<div[^>]*class="[^"]*(?:card|item|result)[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
    const containers = html.match(cardContainerRegex) || [];
    
    // Strategy 2: If no containers found, parse entire HTML as single card
    const htmlSections = containers.length > 0 ? containers : [html];
    
    console.log(`[card-show-fetch-alt] Found ${htmlSections.length} potential card section(s)`);
    
    for (let i = 0; i < htmlSections.length; i++) {
      const section = htmlSections[i];
      
      // Extract card details from this section
      const titleMatch = section.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i) || 
                        section.match(/class="[^"]*(?:card|item)[_-]?title[^"]*"[^>]*>([^<]+)</i) ||
                        section.match(/>([^<]{10,100})</); // Fallback: any text 10-100 chars
      const title = titleMatch ? titleMatch[1].trim() : `Card ${certNumber}-${i + 1}`;
      
      // Skip if title looks like navigation or header text
      if (title.match(/^(home|back|search|menu|cart|login|sign|filter)/i)) {
        continue;
      }

      // Grade extraction
      const gradeMatch = section.match(/grade["\s:]+(\d+(?:\.\d+)?)/i) ||
                        section.match(/>\s*(\d+(?:\.\d+)?)\s*<\/.*grade/i) ||
                        section.match(/\b(\d+(?:\.\d)?)\s*PSA\b/i) ||
                        section.match(/\bPSA\s*(\d+(?:\.\d)?)\b/i);
      const grade = gradeMatch ? gradeMatch[1] : null;

      // Grading service
      const serviceMatch = section.match(/(PSA|BGS|CGC|SGC)/i);
      const gradingService = serviceMatch ? serviceMatch[1].toUpperCase() : 'PSA';

      // Image URL - try multiple patterns (img tags, CSS background-image, srcset)
      let imageUrl = null;
      
      // Strategy 1: Look for img tags with src
      const imgMatch = section.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      if (imgMatch) {
        const src = imgMatch[1];
        if (!src.match(/icon|logo|avatar|button|banner/i) && 
            (src.match(/card|item|image|product|cert/i) || src.match(/\.(jpg|jpeg|png|webp)/i))) {
          imageUrl = src.startsWith('http') ? src : `https://app.alt.xyz${src}`;
        }
      }
      
      // Strategy 2: Look for CSS background-image
      if (!imageUrl) {
        const bgMatch = section.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
        if (bgMatch) {
          const src = bgMatch[1];
          if (!src.match(/icon|logo|avatar|button|banner/i)) {
            imageUrl = src.startsWith('http') ? src : `https://app.alt.xyz${src}`;
          }
        }
      }
      
      // Strategy 3: Look for srcset attributes
      if (!imageUrl) {
        const srcsetMatch = section.match(/srcset=["']([^"']+)["']/i);
        if (srcsetMatch) {
          const srcset = srcsetMatch[1];
          const firstSrc = srcset.split(',')[0].trim().split(' ')[0];
          if (firstSrc && !firstSrc.match(/icon|logo|avatar|button|banner/i)) {
            imageUrl = firstSrc.startsWith('http') ? firstSrc : `https://app.alt.xyz${firstSrc}`;
          }
        }
      }
      
      // Strategy 4: Look for picture elements
      if (!imageUrl) {
        const pictureMatch = section.match(/<picture[^>]*>[\s\S]*?<source[^>]+srcset=["']([^"']+)["']/i);
        if (pictureMatch) {
          const src = pictureMatch[1].split(',')[0].trim().split(' ')[0];
          if (src && !src.match(/icon|logo|avatar|button|banner/i)) {
            imageUrl = src.startsWith('http') ? src : `https://app.alt.xyz${src}`;
          }
        }
      }
      
      // Strategy 5: Fallback - any image with card-like patterns
      if (!imageUrl) {
        const allImages = section.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
        for (const img of allImages) {
          const srcMatch = img.match(/src=["']([^"']+)["']/i);
          if (srcMatch) {
            const src = srcMatch[1];
            if (src.match(/\.(jpg|jpeg|png|webp)/i) && !src.match(/icon|logo|avatar|button|banner/i)) {
              imageUrl = src.startsWith('http') ? src : `https://app.alt.xyz${src}`;
              break;
            }
          }
        }
      }
      
      // Log image detection results for debugging
      if (imageUrl) {
        console.log(`[card-show-fetch-alt] Found image for cert ${certNumber}: ${imageUrl}`);
      } else {
        console.log(`[card-show-fetch-alt] No image found for cert ${certNumber} in section`);
      }

      // ALT value/price
      const valueMatch = section.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      const altValue = valueMatch ? parseFloat(valueMatch[1].replace(/,/g, '')) : null;

      // Set name extraction
      const setMatch = section.match(/set["\s:]+([^<"]{3,50})/i) ||
                      section.match(/series["\s:]+([^<"]{3,50})/i);
      const setName = setMatch ? setMatch[1].trim() : null;

      // Population
      const popMatch = section.match(/population["\s:]+(\d+)/i) ||
                      section.match(/pop["\s:]+(\d+)/i);
      const population = popMatch ? parseInt(popMatch[1]) : null;
      
      // Only add cards that have meaningful data
      if (grade || altValue || imageUrl) {
        cards.push({
          title,
          grade,
          grading_service: gradingService,
          set_name: setName,
          image_url: imageUrl,
          alt_value: altValue,
          population,
        });
      }
    }
    
    // If no cards parsed, create a default one with whatever we can extract
    if (cards.length === 0) {
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const gradeMatch = html.match(/\b(\d+(?:\.\d)?)\b/);
      const serviceMatch = html.match(/(PSA|BGS|CGC|SGC)/i);
      
      cards.push({
        title: titleMatch ? titleMatch[1].trim() : `Card ${certNumber}`,
        grade: gradeMatch ? gradeMatch[1] : null,
        grading_service: serviceMatch ? serviceMatch[1].toUpperCase() : 'PSA',
        set_name: null,
        image_url: null,
        alt_value: null,
        population: null,
      });
    }

    console.log(`[card-show-fetch-alt] Parsed ${cards.length} card(s)`);

    // Save all cards to alt_items table
    const savedCards = [];
    
    for (const cardData of cards) {
      // Create unique identifier using cert number + title hash to avoid conflicts
      const titleHash = cardData.title.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
      const uniqueId = `${certNumber}-${titleHash}`;
      
      const altItemData = {
        alt_uuid: uniqueId,
        alt_url: altUrl,
        title: cardData.title,
        grade: cardData.grade,
        grading_service: cardData.grading_service,
        set_name: cardData.set_name,
        image_url: cardData.image_url,
        alt_value: cardData.alt_value,
        population: cardData.population,
        alt_checked_at: new Date().toISOString(),
      };

      const { data: altItem, error: insertError } = await supabaseClient
        .from('alt_items')
        .upsert(altItemData, { onConflict: 'alt_uuid' })
        .select()
        .single();

      if (insertError) {
        console.warn(`[card-show-fetch-alt] Error saving card "${cardData.title}":`, insertError.message);
      } else {
        savedCards.push(altItem);
      }
    }
    
    if (savedCards.length === 0) {
      console.error('[card-show-fetch-alt] No cards were saved successfully');
      return new Response(JSON.stringify({ error: 'Failed to save any cards' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If defaults were provided (buy/sell prices), create transactions for all cards
    if (defaults?.buy || defaults?.sell) {
      for (const altItem of savedCards) {
        const transactions = [];
        
        if (defaults.buy) {
          transactions.push({
            alt_item_id: altItem.id,
            show_id: defaults.buy.showId,
            txn_type: 'BUY',
            price: defaults.buy.price,
            txn_date: new Date().toISOString(),
          });
        }
        
        if (defaults.sell) {
          transactions.push({
            alt_item_id: altItem.id,
            show_id: defaults.sell.showId,
            txn_type: 'SELL',
            price: defaults.sell.price,
            txn_date: new Date().toISOString(),
          });
        }

        if (transactions.length > 0) {
          const { error: txnError } = await supabaseClient
            .from('card_transactions')
            .insert(transactions);
          
          if (txnError) {
            console.warn(`[card-show-fetch-alt] Error saving transactions for item ${altItem.id}:`, txnError);
          }
        }
      }
    }

    console.log(`[card-show-fetch-alt] Successfully saved ${savedCards.length} card(s) for cert ${certNumber}`);

    return new Response(JSON.stringify({ 
      success: true,
      cards: savedCards,
      count: savedCards.length
    }), {
      status: 200,
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
