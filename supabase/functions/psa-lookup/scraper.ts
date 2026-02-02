import { log } from "../_lib/log.ts";

interface ScrapedComicData {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  gradeLabel?: string;      // Full grade label (e.g., "NM+ 9.6")
  graderNotes?: string;
  year?: string;
  publicationDate?: string;  // Full date (e.g., "2025-01")
  brandTitle?: string;       // Publisher for comics
  subject?: string;          // Comic title/name
  cardNumber?: string;       // Volume number for comics
  issueNumber?: string;      // Issue number if available
  varietyPedigree?: string;  // Variant
  category?: string;
  language?: string;
  country?: string;
  pageQuality?: string;
  imageUrl?: string;
  imageUrls?: string[];
  psaUrl: string;
}

/**
 * Extracts field value from HTML using label matching
 */
function extractField(html: string, label: string): string | undefined {
  // Try multiple patterns for different HTML structures
  const patterns = [
    // Pattern: <dt>Label</dt><dd>Value</dd>
    new RegExp(`<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd[^>]*>([^<]+)</dd>`, 'i'),
    // Pattern: Label</span><span>Value
    new RegExp(`${label}</[^>]+>\\s*<[^>]+>([^<]+)`, 'i'),
    // Pattern: Label</th><td>Value
    new RegExp(`${label}</th>\\s*<td[^>]*>([^<]+)`, 'i'),
    // Pattern: aria-label="Label" followed by value
    new RegExp(`aria-label="${label}"[^>]*>([^<]+)`, 'i'),
    // Pattern: data-label="Label">Value
    new RegExp(`data-label="${label}"[^>]*>([^<]+)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return undefined;
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
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

    // Extract all fields from HTML
    const result: ScrapedComicData = {
      certNumber,
      isValid: true,
      psaUrl: url
    };

    // Extract Item Grade (e.g., "NM+ 9.6")
    const gradeLabel = extractField(html, 'Item Grade');
    if (gradeLabel) {
      result.gradeLabel = gradeLabel;
      // Extract just the numeric grade
      const numericMatch = gradeLabel.match(/(\d+\.?\d*)/);
      result.grade = numericMatch ? numericMatch[1] : gradeLabel;
    }

    // Extract Grader Notes
    const graderNotes = extractField(html, 'Grader Notes');
    if (graderNotes) {
      result.graderNotes = graderNotes;
    }

    // Extract Name (comic title)
    const name = extractField(html, 'Name');
    if (name) {
      result.subject = name;
    }

    // Extract Volume Number
    const volumeNumber = extractField(html, 'Volume Number');
    if (volumeNumber) {
      result.cardNumber = volumeNumber;
    }

    // Extract Issue Number if present
    const issueNumber = extractField(html, 'Issue Number');
    if (issueNumber) {
      result.issueNumber = issueNumber;
    }

    // Extract Publication Date (e.g., "2025-01")
    const pubDate = extractField(html, 'Publication Date');
    if (pubDate) {
      result.publicationDate = pubDate;
      const yearMatch = pubDate.match(/(\d{4})/);
      result.year = yearMatch ? yearMatch[1] : pubDate;
    }

    // Extract Publisher
    const publisher = extractField(html, 'Publisher');
    if (publisher) {
      result.brandTitle = publisher;
    }

    // Extract Variant
    const variant = extractField(html, 'Variant');
    if (variant) {
      result.varietyPedigree = variant;
    }

    // Extract Language
    const language = extractField(html, 'Language');
    if (language) {
      result.language = language;
    }

    // Extract Country
    const country = extractField(html, 'Country');
    if (country) {
      result.country = country;
    }

    // Extract Page Quality
    const pageQuality = extractField(html, 'Page Quality');
    if (pageQuality) {
      result.pageQuality = pageQuality;
    }

    // Extract Category
    const category = extractField(html, 'Category');
    if (category) {
      result.category = category;
    }

    // Extract images from cloudfront URLs
    const imageUrls: string[] = [];
    const imageMatches = html.matchAll(/https:\/\/d1htnxwo4o0jhw\.cloudfront\.net\/cert\/\d+\/[^"'\s]+\.(?:jpg|png|webp)/gi);
    for (const match of imageMatches) {
      const imgUrl = match[0].replace('/thumbnail/', '/').split('?')[0];
      if (!imageUrls.includes(imgUrl)) {
        imageUrls.push(imgUrl);
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
      hasPublisher: !!result.brandTitle,
      hasVariant: !!result.varietyPedigree,
      hasGraderNotes: !!result.graderNotes,
      imageCount: imageUrls.length
    });

    return result;
  } catch (error) {
    log.error('[psa-scraper] Error scraping cert', { requestId, certNumber, error: String(error) });
    return null;
  }
}
