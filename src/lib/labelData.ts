import { LabelData } from '@/lib/labelRenderer';

export interface CardItem {
  id?: string;
  title?: string;
  sku?: string;
  price?: string; // Changed to string to match Index.tsx CardItem type
  lot?: string;
  grade?: string;
  year?: string;
  brandTitle?: string;
  cardNumber?: string;
  subject?: string;
  variant?: string;
}

/**
 * Build title from card parts
 */
export function buildTitleFromParts(
  year?: string, 
  brand?: string, 
  cardNumber?: string, 
  subject?: string, 
  variant?: string
): string {
  const parts = [year, brand, cardNumber, subject, variant].filter(Boolean);
  return parts.join(' ');
}

/**
 * Abbreviate common card grades for compact display
 */
export function abbreviateGrade(grade?: string): string {
  if (!grade) return '';
  
  const gradeMap: Record<string, string> = {
    'Near Mint': 'NM',
    'Near Mint-Mint': 'NM-M',
    'Mint': 'M',
    'Gem Mint': 'GM',
    'Gem MT': 'GM',
    'GEM MT 10': 'GM 10',
    'MINT 9': 'M 9',
    'NM-MT 8': 'NM-M 8',
    'NM 7': 'NM 7',
    'EX-MT 6': 'EX-M 6',
    'EX 5': 'EX 5',
    'VG-EX 4': 'VG-E 4',
    'VG 3': 'VG 3',
    'GOOD 2': 'G 2',
    'FR 1.5': 'FR 1.5',
    'PR 1': 'PR 1',
    'Excellent': 'EX',
    'Very Good': 'VG',
    'Good': 'G',
    'Fair': 'F',
    'Poor': 'P',
    'Authentic': 'AUTH',
    'Raw': 'RAW'
  };
  
  return gradeMap[grade] || grade;
}

/**
 * Centralized function to build LabelData from CardItem
 * This ensures consistent data mapping between preview and printing
 */
export function buildLabelDataFromItem(item: CardItem): LabelData {
  // Format price with $ symbol
  const formatPrice = (price?: string) => {
    if (!price) return '';
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? price : `$${Math.round(numPrice)}`;
  };

  return {
    title: buildTitleFromParts(item.year, item.brandTitle, item.cardNumber, item.subject, item.variant),
    sku: item.sku || item.id?.toString() || 'NO-SKU',
    price: formatPrice(item.price),
    lot: item.lot || '',
    condition: abbreviateGrade(item.grade || item.variant),
    barcode: item.sku || item.id?.toString() || 'NO-SKU'
  };
}