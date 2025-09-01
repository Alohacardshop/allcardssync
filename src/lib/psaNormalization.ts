import { PSACertificateData } from "@/types/psa";

export function normalizePSAData(rawData: any): PSACertificateData {
  // Ensure imageUrls is always an array, not a stringified array
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

  // Sanitize and clean values
  const sanitizeValue = (value: any): string | undefined => {
    if (!value || value === 'null' || value === 'undefined') return undefined;
    return String(value).trim() || undefined;
  };

  return {
    certNumber: sanitizeValue(rawData.certNumber) || rawData.cert || '',
    isValid: Boolean(rawData.isValid),
    grade: sanitizeValue(rawData.grade),
    year: sanitizeValue(rawData.year),
    brandTitle: sanitizeValue(rawData.brandTitle || rawData.brand),
    subject: sanitizeValue(rawData.subject),
    cardNumber: sanitizeValue(rawData.cardNumber || rawData.card_number),
    varietyPedigree: sanitizeValue(rawData.varietyPedigree || rawData.variety_pedigree),
    category: sanitizeValue(rawData.category),
    gameSport: sanitizeValue(rawData.gameSport || rawData.game_sport),
    imageUrl: sanitizeValue(rawData.imageUrl || rawData.image_url),
    imageUrls: imageUrls.filter(url => url && typeof url === 'string' && url.trim()),
    psaUrl: rawData.psaUrl || `https://www.psacard.com/cert/${rawData.certNumber || rawData.cert}/psa`,
    source: rawData.source,
    diagnostics: rawData.diagnostics
  };
}