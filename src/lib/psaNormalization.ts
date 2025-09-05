import { PSACertificateData } from "@/types/psa";

export function normalizePSAData(rawData: any): PSACertificateData {
  // Robust text cleaner to remove PSA webpage artifacts
  const cleanText = (text: string): string => {
    if (!text) return '';
    
    return text
      // Remove markdown links [text](url)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove standalone URLs
      .replace(/https?:\/\/[^\s]+/g, '')
      // Remove image markdown ![alt](url)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Remove HTML-like tags
      .replace(/<[^>]+>/g, '')
      // Remove PSA-specific footer text
      .replace(/Note: If you believe the label on your cert.*$/i, '')
      .replace(/Sales of Similar Items.*$/i, '')
      .replace(/Set Registry.*$/i, '')
      .replace(/View All.*$/i, '')
      // Remove markdown table separators and pipes
      .replace(/\|[\s\-|]+\|/g, '')
      .replace(/\|/g, ' ')
      // Remove data URIs and base64 content
      .replace(/data:image\/[^;]+;[^,]+,/g, '')
      // Remove extra whitespace, newlines, and normalize spaces
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .trim();
  };

  // Extract clean field values with specific cleaning rules
  const extractCleanField = (value: any, maxLength = 100): string | undefined => {
    if (!value || value === 'null' || value === 'undefined') return undefined;
    
    let cleaned = cleanText(String(value));
    
    // Additional field-specific cleaning
    cleaned = cleaned
      // Remove common PSA artifacts that appear at the end
      .replace(/\s*(Subject|Category|Card Number|Variety\/Pedigree).*$/i, '')
      // Remove pricing information
      .replace(/\$[\d,.]+/g, '')
      // Remove auction/eBay references
      .replace(/\b(eBay|Auction|Lot #?)\b/gi, '')
      // Remove dates in various formats
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '')
      .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{2,4}\b/gi, '')
      // Clean up remaining artifacts
      .replace(/\b(PSA|Cert)\s*#?\s*\d+\b/gi, '')
      .replace(/\bSeller\/Type\b/gi, '')
      .replace(/\bListing\b/gi, '')
      .trim();

    // Truncate to prevent database errors
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength).trim();
    }

    return cleaned || undefined;
  };

  // Process imageUrls array
  let imageUrls: string[] = [];
  if (rawData.imageUrls) {
    if (typeof rawData.imageUrls === 'string') {
      try {
        imageUrls = JSON.parse(rawData.imageUrls);
      } catch {
        imageUrls = [rawData.imageUrls];
      }
    } else if (Array.isArray(rawData.imageUrls)) {
      imageUrls = rawData.imageUrls;
    }
  }
  
  // Filter and clean image URLs
  imageUrls = imageUrls
    .filter(url => url && typeof url === 'string' && url.trim())
    .filter(url => !url.startsWith('data:image/svg+xml')) // Remove placeholder SVGs
    .map(url => url.trim());

  // Extract year from potentially polluted year field
  const extractYear = (yearField: any): string | undefined => {
    if (!yearField) return undefined;
    const yearMatch = String(yearField).match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : undefined;
  };

  // Extract card number - often gets polluted with category info
  const extractCardNumber = (cardNumField: any): string | undefined => {
    if (!cardNumField) return undefined;
    const cleaned = cleanText(String(cardNumField));
    const cardMatch = cleaned.match(/^(\d+[A-Za-z]?|\d+\/\d+)/);
    return cardMatch ? cardMatch[0] : undefined;
  };

  return {
    certNumber: extractCleanField(rawData.certNumber || rawData.cert, 50) || '',
    isValid: Boolean(rawData.isValid),
    grade: extractCleanField(rawData.grade, 20),
    year: extractYear(rawData.year),
    brandTitle: extractCleanField(rawData.brandTitle || rawData.brand, 100),
    subject: extractCleanField(rawData.subject, 100),
    cardNumber: extractCardNumber(rawData.cardNumber || rawData.card_number),
    varietyPedigree: extractCleanField(rawData.varietyPedigree || rawData.variety_pedigree, 100),
    category: extractCleanField(rawData.category, 100),
    gameSport: extractCleanField(rawData.gameSport || rawData.game_sport, 100),
    imageUrl: rawData.imageUrl || rawData.image_url || (imageUrls.length > 0 ? imageUrls[0] : undefined),
    imageUrls,
    psaUrl: rawData.psaUrl || `https://www.psacard.com/cert/${rawData.certNumber || rawData.cert}/psa`,
    source: rawData.source,
    diagnostics: rawData.diagnostics
  };
}