import { log } from "../_lib/log.ts";
import { getCorsHeaders } from "../_lib/cors.ts";

// Response building utilities
export function buildResponseHeaders(origin: string | null, requestId: string): HeadersInit {
  return {
    ...getCorsHeaders(origin),
    'Content-Type': 'application/json',
    'X-Request-Id': requestId
  };
}

export function buildJsonResponse(
  body: Record<string, any>,
  options: { status?: number; headers: HeadersInit }
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status: options.status || 200,
      headers: options.headers
    }
  );
}

// Data transformation utilities
export function normalizePsaCertData(oldCache: any): any {
  return {
    certNumber: oldCache.cert_number,
    isValid: oldCache.is_valid,
    grade: oldCache.grade,
    year: oldCache.year,
    brandTitle: oldCache.brand,
    subject: oldCache.subject,
    cardNumber: oldCache.card_number,
    category: oldCache.category,
    varietyPedigree: oldCache.variety_pedigree,
    imageUrl: oldCache.image_url,
    imageUrls: oldCache.image_urls,
    psaUrl: oldCache.psa_url
  };
}

export function extractNumericGrade(gradeStr: string): string | undefined {
  if (!gradeStr) return undefined;
  const match = gradeStr.match(/\d+/);
  return match ? match[0] : undefined;
}

export function extractImageUrls(imagesData: any[] | null): {
  imageUrls: string[];
  primaryImageUrl: string | undefined;
} {
  let imageUrls: string[] = [];
  let primaryImageUrl: string | undefined = undefined;

  if (imagesData && Array.isArray(imagesData)) {
    imageUrls = imagesData.map(img => img.ImageURL).filter(url => url);
    const frontImage = imagesData.find(img => img.IsFrontImage === true);
    primaryImageUrl = frontImage?.ImageURL || imageUrls[0];
  }

  return { imageUrls, primaryImageUrl };
}

export function transformPsaApiResponse(
  certNumber: string,
  psaCert: any,
  imagesData: any[] | null
): any {
  const { imageUrls, primaryImageUrl } = extractImageUrls(imagesData);

  return {
    certNumber,
    isValid: true,
    grade: extractNumericGrade(psaCert?.CardGrade),
    year: psaCert?.Year || undefined,
    brandTitle: psaCert?.Brand || undefined,
    subject: psaCert?.Subject || undefined,
    cardNumber: psaCert?.CardNumber || undefined,
    category: psaCert?.Category || undefined,
    varietyPedigree: psaCert?.Variety || undefined,
    imageUrl: primaryImageUrl,
    imageUrls: imageUrls,
    psaUrl: `https://www.psacard.com/cert/${certNumber}`
  };
}

// Database caching utilities
export async function cacheCertificateData(
  supabase: any,
  certNumber: string,
  responseData: any,
  requestId: string
): Promise<void> {
  // Cache in new image cache table
  try {
    await supabase
      .from('catalog_v2.psa_image_cache')
      .upsert({
        cert: certNumber,
        primary_url: responseData.imageUrl,
        all_urls: responseData.imageUrls,
        updated_at: new Date().toISOString()
      });
  } catch (err) {
    log.error('[psa-lookup] Failed to cache images', { requestId, error: String(err) });
  }

  // Also cache in old table for backwards compatibility
  try {
    await supabase
      .from('psa_certificates')
      .upsert({
        cert_number: certNumber,
        is_valid: true,
        grade: responseData.grade,
        year: responseData.year,
        brand: responseData.brandTitle,
        subject: responseData.subject,
        card_number: responseData.cardNumber,
        category: responseData.category,
        variety_pedigree: responseData.varietyPedigree,
        image_url: responseData.imageUrl,
        image_urls: responseData.imageUrls,
        psa_url: responseData.psaUrl,
        scraped_at: new Date().toISOString()
      });
  } catch (err) {
    log.error('[psa-lookup] Failed to cache cert', { requestId, error: String(err) });
  }
}
