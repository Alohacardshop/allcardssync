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
 * Extracts field value from structured markdown
 * Looks for "Label" followed by "Value" pattern in Item Information section
 */
function extractField(markdown: string, label: string): string | undefined {
  // First, try to find the Item Information section
  const itemInfoMatch = markdown.match(/### Item Information[\s\S]*?(?=\* \* \*|Note:|$)/i);
  const searchText = itemInfoMatch ? itemInfoMatch[0] : markdown;
  
  // PSA markdown format: "Label\n\nValue" or just lines with "LabelValue"
  const patterns = [
    // Pattern: Label on one line, value on next non-empty line
    new RegExp(`${label}\\n+([^\\n]+)`, 'i'),
    // Pattern: Label followed by value (for inline format)
    new RegExp(`\\b${label}\\s*[:：]?\\s*([^\\n]+)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = searchText.match(pattern);
    if (match && match[1]) {
      let value = match[1].trim();
      // Clean up any markdown artifacts
      value = value.replace(/\s*\* \* \*.*$/, '').trim();
      value = value.replace(/^#+\s*/, '').trim(); // Remove heading markers
      // Skip if value looks like navigation, HTML, or another section
      if (value && 
          !value.startsWith('<') && 
          !value.startsWith('http') &&
          !value.startsWith('[') &&  // Skip markdown links
          !value.includes('/>') &&
          !value.match(/^(Shop|Search|Home|Account|Help)/i) &&
          value.length < 200 &&
          value.length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Scrapes PSA cert page for comics using Firecrawl for clean markdown
 */
export async function scrapeComicCert(certNumber: string, requestId: string): Promise<ScrapedComicData | null> {
  const url = `https://www.psacard.com/cert/${certNumber}`;
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  try {
    log.info('[psa-scraper] Fetching cert page', { requestId, certNumber, url, hasFirecrawl: !!firecrawlApiKey });
    
    let markdown: string;
    let html: string = '';
    
    if (firecrawlApiKey) {
      // Use Firecrawl for clean markdown extraction
      const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html'],
          onlyMainContent: false, // We need the full page for Item Information section
          waitFor: 2000, // Wait for dynamic content
        }),
      });

      if (!firecrawlResponse.ok) {
        const errText = await firecrawlResponse.text();
        log.warn('[psa-scraper] Firecrawl failed, falling back to direct fetch', { 
          requestId, 
          status: firecrawlResponse.status,
          error: errText.slice(0, 200)
        });
        // Fall back to direct fetch
        return await directFetchCert(certNumber, url, requestId);
      }

      const firecrawlData = await firecrawlResponse.json();
      markdown = firecrawlData.data?.markdown || firecrawlData.markdown || '';
      html = firecrawlData.data?.html || firecrawlData.html || '';
      
      log.info('[psa-scraper] Firecrawl response received', { 
        requestId, 
        markdownLength: markdown.length,
        hasItemInfo: markdown.includes('Item Information')
      });
    } else {
      // Fall back to direct fetch if no Firecrawl key
      return await directFetchCert(certNumber, url, requestId);
    }
    
    // Check if this is a valid cert page
    if (markdown.includes('Certificate Not Found') || markdown.includes('not found in our database')) {
      log.info('[psa-scraper] Certificate not found', { requestId, certNumber });
      return null;
    }

    // Extract all fields from markdown
    const result: ScrapedComicData = {
      certNumber,
      isValid: true,
      psaUrl: url
    };

    // Extract Item Grade (e.g., "NM 9.4")
    const gradeLabel = extractField(markdown, 'Item Grade');
    if (gradeLabel) {
      result.gradeLabel = gradeLabel;
      const numericMatch = gradeLabel.match(/(\d+\.?\d*)/);
      result.grade = numericMatch ? numericMatch[1] : gradeLabel;
    }

    // Extract Grader Notes
    result.graderNotes = extractField(markdown, 'Grader Notes');

    // Extract Name (comic/magazine title)
    result.subject = extractField(markdown, 'Name');

    // Extract Volume Number or Continuous Issue Number
    result.cardNumber = extractField(markdown, 'Volume Number') || 
                        extractField(markdown, 'Continuous Issue Number');

    // Extract Issue Number if present
    result.issueNumber = extractField(markdown, 'Issue Number');

    // Extract Publication Date
    const pubDate = extractField(markdown, 'Publication Date');
    if (pubDate) {
      result.publicationDate = pubDate;
      const yearMatch = pubDate.match(/(\d{4})/);
      result.year = yearMatch ? yearMatch[1] : pubDate;
    }

    // Extract Publisher
    result.brandTitle = extractField(markdown, 'Publisher');

    // Extract Variant and Cover Subject
    const variant = extractField(markdown, 'Variant');
    const coverSubject = extractField(markdown, 'Cover Subject');
    if (variant && coverSubject) {
      result.varietyPedigree = `${variant} - ${coverSubject}`;
    } else {
      result.varietyPedigree = variant || coverSubject;
    }

    // Extract other fields
    result.language = extractField(markdown, 'Language');
    result.country = extractField(markdown, 'Country');
    result.pageQuality = extractField(markdown, 'Page Quality');
    result.category = extractField(markdown, 'Category');

    // Extract images from cloudfront URLs (check both markdown and html)
    const combinedText = markdown + ' ' + html;
    const imageUrls: string[] = [];
    const imageMatches = combinedText.matchAll(/https:\/\/d1htnxwo4o0jhw\.cloudfront\.net\/cert\/\d+\/[^"'\s\)]+\.(?:jpg|png|webp)/gi);
    for (const match of imageMatches) {
      let imgUrl = match[0].replace('/thumbnail/', '/').replace('/small/', '/').split('?')[0];
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
      grade: result.grade,
      subject: result.subject,
      publisher: result.brandTitle,
      variant: result.varietyPedigree,
      hasGraderNotes: !!result.graderNotes,
      imageCount: imageUrls.length
    });

    return result;
  } catch (error) {
    log.error('[psa-scraper] Error scraping cert', { requestId, certNumber, error: String(error) });
    return null;
  }
}

/**
 * Fallback: Direct fetch if Firecrawl is unavailable
 */
async function directFetchCert(certNumber: string, url: string, requestId: string): Promise<ScrapedComicData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      log.warn('[psa-scraper] Direct fetch failed', { requestId, status: response.status });
      return null;
    }

    const html = await response.text();
    
    if (html.includes('Certificate Not Found') || html.includes('not found in our database')) {
      return null;
    }

    // Basic extraction from raw HTML
    const result: ScrapedComicData = {
      certNumber,
      isValid: true,
      psaUrl: url
    };

    // Try to extract images at minimum
    const imageUrls: string[] = [];
    const imageMatches = html.matchAll(/https:\/\/d1htnxwo4o0jhw\.cloudfront\.net\/cert\/\d+\/[^"'\s]+\.(?:jpg|png|webp)/gi);
    for (const match of imageMatches) {
      const imgUrl = match[0].replace('/thumbnail/', '/').replace('/small/', '/').split('?')[0];
      if (!imageUrls.includes(imgUrl)) {
        imageUrls.push(imgUrl);
      }
    }
    
    if (imageUrls.length > 0) {
      result.imageUrls = imageUrls;
      result.imageUrl = imageUrls[0];
    }

    log.info('[psa-scraper] Direct fetch completed (limited data)', { requestId, certNumber, imageCount: imageUrls.length });
    return result;
  } catch (error) {
    log.error('[psa-scraper] Direct fetch error', { requestId, error: String(error) });
    return null;
  }
}
