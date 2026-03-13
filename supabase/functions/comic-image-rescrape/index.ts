import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from "../_lib/cors.ts";
import { log, genRequestId } from "../_lib/log.ts";
import { scrapeComicCert } from "../psa-lookup/scraper.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

const PACE_MS = 2000; // 2s between scrapes to avoid rate limiting from PSA/Firecrawl
const DEFAULT_LIMIT = 20; // Conservative default — 20 items × ~3s each = ~60s

const pace = () => new Promise(resolve => setTimeout(resolve, PACE_MS));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = genRequestId();

  try {
    // Auth required
    const user = await requireAuth(req);
    await requireRole(user.id, ['admin', 'staff']);

    const body = await req.json().catch(() => ({}));
    const {
      limit = DEFAULT_LIMIT,
      after_id,
      store_filter,
      mode = 'preview', // 'preview' or 'execute'
      skip_has_images = false, // if true, skip items that already have both images
    } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    // Build query for comics with cert numbers
    let query = supabase
      .from('intake_items')
      .select('id, sku, subject, psa_cert, psa_cert_number, front_image_url, back_image_url, image_urls')
      .eq('main_category', 'comics')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(limit);

    // Only items that have a cert number to look up
    query = query.or('sku.neq.,psa_cert.neq.,psa_cert_number.neq.');

    if (store_filter) {
      query = query.eq('store_key', store_filter);
    }

    if (after_id) {
      query = query.gt('id', after_id);
    }

    if (skip_has_images) {
      query = query.or('front_image_url.is.null,back_image_url.is.null');
    }

    const { data: comics, error: queryError } = await query;
    if (queryError) throw new Error(`Query failed: ${queryError.message}`);
    if (!comics || comics.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        message: 'No comics to process',
        total_processed: 0,
        has_more: false,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Count totals
    const { count: totalComics } = await supabase
      .from('intake_items')
      .select('id', { count: 'exact', head: true })
      .eq('main_category', 'comics')
      .is('deleted_at', null);

    const results: Array<{
      id: string;
      cert: string;
      subject: string | null;
      status: string;
      images_found: number;
      front_image_url: string | null;
      back_image_url: string | null;
      changed: boolean;
    }> = [];

    for (const comic of comics) {
      const certNumber = comic.sku || comic.psa_cert || comic.psa_cert_number;
      if (!certNumber) {
        results.push({
          id: comic.id,
          cert: 'none',
          subject: comic.subject,
          status: 'skipped_no_cert',
          images_found: 0,
          front_image_url: null,
          back_image_url: null,
          changed: false,
        });
        continue;
      }

      try {
        log.info('[comic-rescrape] Scraping cert', { requestId, certNumber, itemId: comic.id });
        const scraped = await scrapeComicCert(certNumber, requestId);

        if (!scraped || !scraped.imageUrls || scraped.imageUrls.length === 0) {
          results.push({
            id: comic.id,
            cert: certNumber,
            subject: comic.subject,
            status: 'no_images_found',
            images_found: 0,
            front_image_url: comic.front_image_url,
            back_image_url: comic.back_image_url,
            changed: false,
          });
          await pace();
          continue;
        }

        const newFront = scraped.imageUrls[0] || null;
        const newBack = scraped.imageUrls[1] || null;
        const changed = newFront !== comic.front_image_url || newBack !== comic.back_image_url;

        if (mode === 'execute' && changed) {
          const { error: updateError } = await supabase
            .from('intake_items')
            .update({
              image_urls: scraped.imageUrls,
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
          id: comic.id,
          cert: certNumber,
          subject: comic.subject,
          status: mode === 'execute' && changed ? 'updated' : changed ? 'would_update' : 'unchanged',
          images_found: scraped.imageUrls.length,
          front_image_url: newFront,
          back_image_url: newBack,
          changed,
        });

        await pace();
      } catch (err) {
        log.error('[comic-rescrape] Error scraping', { requestId, certNumber, error: String(err) });
        results.push({
          id: comic.id,
          cert: certNumber,
          subject: comic.subject,
          status: 'error',
          images_found: 0,
          front_image_url: comic.front_image_url,
          back_image_url: comic.back_image_url,
          changed: false,
        });
        await pace();
      }
    }

    const lastId = comics[comics.length - 1]?.id;
    const summary = {
      total_processed: results.length,
      updated: results.filter(r => r.status === 'updated').length,
      would_update: results.filter(r => r.status === 'would_update').length,
      unchanged: results.filter(r => r.status === 'unchanged').length,
      no_images: results.filter(r => r.status === 'no_images_found').length,
      errors: results.filter(r => r.status === 'error').length,
      skipped: results.filter(r => r.status === 'skipped_no_cert').length,
    };

    return new Response(JSON.stringify({
      ok: true,
      mode,
      summary,
      total_in_catalog: totalComics,
      has_more: comics.length === limit,
      next_cursor: lastId,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId }
    });

  } catch (error) {
    log.error('[comic-rescrape] Fatal error', { requestId, error: String(error) });

    const status = error.message?.includes('Authorization') || error.message?.includes('permissions') ? 401 : 500;
    return new Response(JSON.stringify({
      ok: false,
      error: status === 401 ? error.message : 'Internal server error',
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
