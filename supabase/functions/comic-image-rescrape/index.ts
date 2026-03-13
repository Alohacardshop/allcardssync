import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from "../_lib/cors.ts";
import { log, genRequestId } from "../_lib/log.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

const PACE_MS = 2000;
const DEFAULT_LIMIT = 20;
const pace = () => new Promise(resolve => setTimeout(resolve, PACE_MS));

/**
 * Scrape PSA cert page for comic images using Firecrawl or direct fetch
 */
async function scrapeImages(certNumber: string, requestId: string): Promise<string[]> {
  const url = `https://www.psacard.com/cert/${certNumber}`;
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

  let html = '';

  if (firecrawlApiKey) {
    try {
      const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['html'],
          onlyMainContent: false,
          waitFor: 2000,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        html = data.data?.html || data.html || '';
      }
    } catch {
      // Fall through to direct fetch
    }
  }

  if (!html) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        }
      });
      if (resp.ok) html = await resp.text();
    } catch {
      return [];
    }
  }

  if (!html || html.includes('Certificate Not Found')) return [];

  // Extract cloudfront image URLs
  const imageUrls: string[] = [];
  const matches = html.matchAll(/https:\/\/d1htnxwo4o0jhw\.cloudfront\.net\/cert\/\d+\/[^"'\s\)]+\.(?:jpg|png|webp)/gi);
  for (const m of matches) {
    const imgUrl = m[0].replace('/thumbnail/', '/').replace('/small/', '/').split('?')[0];
    if (!imageUrls.includes(imgUrl)) imageUrls.push(imgUrl);
  }

  // PSA shows front first (left), back second (right) — no reversal needed
  return imageUrls;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = genRequestId();

  try {
    const user = await requireAuth(req);
    await requireRole(user.id, ['admin', 'staff']);

    const body = await req.json().catch(() => ({}));
    const {
      limit = DEFAULT_LIMIT,
      after_id,
      store_filter,
      mode = 'preview',
      skip_has_images = false,
    } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    let query = supabase
      .from('intake_items')
      .select('id, sku, subject, psa_cert, psa_cert_number, front_image_url, back_image_url, image_urls')
      .eq('main_category', 'comics')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(limit);

    if (store_filter) query = query.eq('store_key', store_filter);
    if (after_id) query = query.gt('id', after_id);
    if (skip_has_images) {
      query = query.or('front_image_url.is.null,back_image_url.is.null');
    }

    const { data: comics, error: queryError } = await query;
    if (queryError) throw new Error(`Query failed: ${queryError.message}`);
    if (!comics || comics.length === 0) {
      return new Response(JSON.stringify({
        ok: true, message: 'No comics to process', total_processed: 0, has_more: false,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { count: totalComics } = await supabase
      .from('intake_items')
      .select('id', { count: 'exact', head: true })
      .eq('main_category', 'comics')
      .is('deleted_at', null);

    const results: any[] = [];

    for (const comic of comics) {
      const certNumber = comic.sku || comic.psa_cert || comic.psa_cert_number;
      if (!certNumber) {
        results.push({ id: comic.id, cert: 'none', subject: comic.subject, status: 'skipped_no_cert', images_found: 0, changed: false });
        continue;
      }

      try {
        log.info('[comic-rescrape] Scraping', { requestId, certNumber, itemId: comic.id });
        const imageUrls = await scrapeImages(certNumber, requestId);

        if (imageUrls.length === 0) {
          results.push({ id: comic.id, cert: certNumber, subject: comic.subject, status: 'no_images_found', images_found: 0, changed: false });
          await pace();
          continue;
        }

        const newFront = imageUrls[0] || null;
        const newBack = imageUrls[1] || null;
        const changed = newFront !== comic.front_image_url || newBack !== comic.back_image_url;

        if (mode === 'execute') {
          const { error: updateError } = await supabase
            .from('intake_items')
            .update({
              image_urls: imageUrls,
              front_image_url: newFront,
              back_image_url: newBack,
              updated_at: new Date().toISOString(),
              updated_by: 'comic_image_rescrape',
            })
            .eq('id', comic.id);

          if (updateError) {
            log.error('[comic-rescrape] Update failed', { requestId, itemId: comic.id, error: updateError.message });
          }
        }

        results.push({
          id: comic.id, cert: certNumber, subject: comic.subject,
          status: mode === 'execute' ? (changed ? 'updated' : 'unchanged') : (changed ? 'would_update' : 'unchanged'),
          images_found: imageUrls.length,
          new_front: newFront, new_back: newBack,
          old_front: comic.front_image_url, old_back: comic.back_image_url,
          changed,
        });

        await pace();
      } catch (err) {
        log.error('[comic-rescrape] Error', { requestId, certNumber, error: String(err) });
        results.push({ id: comic.id, cert: certNumber, subject: comic.subject, status: 'error', images_found: 0, changed: false, error: String(err) });
        await pace();
      }
    }

    const lastId = comics[comics.length - 1]?.id;

    return new Response(JSON.stringify({
      ok: true, mode,
      summary: {
        total_processed: results.length,
        updated: results.filter(r => r.status === 'updated').length,
        would_update: results.filter(r => r.status === 'would_update').length,
        unchanged: results.filter(r => r.status === 'unchanged').length,
        no_images: results.filter(r => r.status === 'no_images_found').length,
        errors: results.filter(r => r.status === 'error').length,
      },
      total_in_catalog: totalComics,
      remaining: (totalComics || 0) - (results.length + (after_id ? 1 : 0)),
      has_more: comics.length === limit,
      next_cursor: lastId,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId }
    });

  } catch (error) {
    log.error('[comic-rescrape] Fatal', { requestId, error: String(error) });
    const status = error.message?.includes('Authorization') || error.message?.includes('permissions') ? 401 : 500;
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
