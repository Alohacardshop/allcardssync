import { log } from "../_lib/log.ts";

interface ScrapedComicData {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  year?: string;
  brandTitle?: string;  // Publisher for comics
  subject?: string;     // Comic title
  cardNumber?: string;  // Issue number
  varietyPedigree?: string;
  category?: string;
  imageUrl?: string;
  imageUrls?: string[];
  psaUrl: string;
}

/**
 * Scrapes PSA cert page for comics (API doesn't support comics)
 */
export async function scrapeComicCert(certNumber: string, requestId: string): Promise<ScrapedComicData | null> {
  const url = `https://www.psacard.com/cert/${certNumber}`;
  
  try {
    log.info('[psa-scraper] Fetching cert page', { requestId, certNumber, url });
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });

    if (!response.ok) {
      log.warn('[psa-scraper] Failed to fetch page', { requestId, status: response.status });
      return null;
    }

    const html = await response.text();
    
    // Check if this is a valid cert page
    if (html.includes('Certificate Not Found') || html.includes('not found in our database')) {
      log.info('[psa-scraper] Certificate not found', { requestId, certNumber });
      return null;
    }

    // Extract data from HTML
    const result: ScrapedComicData = {
      certNumber,
      isValid: true,
      psaUrl: url
    };

    // Extract grade (e.g., "NM+ 9.6" or just "9.6")
    const gradeMatch = html.match(/Item Grade\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i) 
      || html.match(/Item Grade[\s\S]*?<[^>]+>([A-Z\-\+\s]*\d+\.?\d*)/i)
      || html.match(/>([A-Z\-\+]+\s+\d+\.?\d*)</);
    if (gradeMatch) {
      // Extract just the numeric grade
      const numericMatch = gradeMatch[1].match(/(\d+\.?\d*)/);
      result.grade = numericMatch ? numericMatch[1] : gradeMatch[1].trim();
    }

    // Extract comic name/subject
    const nameMatch = html.match(/Name<\/[^>]+>\s*<[^>]+>([^<]+)/i)
      || html.match(/<h\d[^>]*>#\d+\s+([^<]+)/i);
    if (nameMatch) {
      result.subject = nameMatch[1].trim();
    }

    // Extract publisher (brand)
    const publisherMatch = html.match(/Publisher<\/[^>]+>\s*<[^>]+>([^<]+)/i);
    if (publisherMatch) {
      result.brandTitle = publisherMatch[1].trim();
    }

    // Extract publication date/year
    const dateMatch = html.match(/Publication Date<\/[^>]+>\s*<[^>]+>([^<]+)/i);
    if (dateMatch) {
      const yearMatch = dateMatch[1].match(/(\d{4})/);
      result.year = yearMatch ? yearMatch[1] : dateMatch[1].trim();
    }

    // Extract volume number as card number
    const volumeMatch = html.match(/Volume Number<\/[^>]+>\s*<[^>]+>([^<]+)/i);
    if (volumeMatch) {
      result.cardNumber = volumeMatch[1].trim();
    }

    // Extract variant
    const variantMatch = html.match(/Variant<\/[^>]+>\s*<[^>]+>([^<]+)/i);
    if (variantMatch) {
      result.varietyPedigree = variantMatch[1].trim();
    }

    // Extract category
    const categoryMatch = html.match(/Category<\/[^>]+>\s*<[^>]+>([^<]+)/i);
    if (categoryMatch) {
      result.category = categoryMatch[1].trim();
    }

    // Extract images from cloudfront URLs
    const imageUrls: string[] = [];
    const imageMatches = html.matchAll(/https:\/\/d1htnxwo4o0jhw\.cloudfront\.net\/cert\/\d+\/[^"'\s]+\.jpg/g);
    for (const match of imageMatches) {
      const url = match[0].replace('/thumbnail/', '/').replace('?', '');
      if (!imageUrls.includes(url)) {
        imageUrls.push(url);
      }
    }
    
    if (imageUrls.length > 0) {
      result.imageUrls = imageUrls;
      result.imageUrl = imageUrls[0];
    }

    log.info('[psa-scraper] Successfully scraped comic cert', { 
      requestId, 
      certNumber,
      hasGrade: !!result.grade,
      hasSubject: !!result.subject,
      imageCount: imageUrls.length
    });

    return result;
  } catch (error) {
    log.error('[psa-scraper] Error scraping cert', { requestId, certNumber, error: String(error) });
    return null;
  }
}
