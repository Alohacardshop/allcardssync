// Apply field mappings from print profile to generate label data

import type { SampleData } from '@/features/barcode/types/labelLayout';

export interface FieldMapping {
  source: string;
  source2?: string; // Secondary source (for title - combines with separator)
  separator?: string; // Separator between source and source2 (default: " - ")
  format?: 'currency' | 'uppercase' | 'lowercase';
  abbreviate?: boolean;
  abbreviations?: Record<string, string>;
}

export interface FieldMappings {
  [key: string]: FieldMapping;
}

// Default condition abbreviations
export const CONDITION_ABBREVIATIONS: Record<string, string> = {
  'Near Mint': 'NM',
  'Lightly Played': 'LP',
  'Moderately Played': 'MP',
  'Heavily Played': 'HP',
  'Damaged': 'DMG',
  'Near Mint Foil': 'NM-F',
  'Lightly Played Foil': 'LP-F',
  'Moderately Played Foil': 'MP-F',
  'Heavily Played Foil': 'HP-F',
  'Damaged Foil': 'DMG-F',
  // TCG specific conditions
  'NM': 'NM',
  'LP': 'LP',
  'MP': 'MP',
  'HP': 'HP',
  'DMG': 'DMG',
  // Graded card conditions
  'PSA 10': '10',
  'PSA 9': '9',
  'PSA 8': '8',
  'PSA 7': '7',
  'PSA 6': '6',
  'PSA 5': '5',
  'PSA 4': '4',
  'PSA 3': '3',
  'PSA 2': '2',
  'PSA 1': '1',
  'BGS 10': 'BGS10',
  'BGS 9.5': 'BGS9.5',
  'BGS 9': 'BGS9',
  'CGC 10': 'CGC10',
  'CGC 9.5': 'CGC9.5',
  'CGC 9': 'CGC9',
};

// Default field mappings
// brand_title = set name (e.g., "Destined Rivals")
// subject = card name (e.g., "Mega Charizard X ex")
export const DEFAULT_FIELD_MAPPINGS: FieldMappings = {
  title: { source: 'subject' },  // Card name goes to title
  sku: { source: 'sku' },
  price: { source: 'price', format: 'currency' },
  condition: { source: 'grade', abbreviate: true },
  barcode: { source: 'sku' },
  set: { source: 'brand_title' },  // Set name from brand_title
  cardNumber: { source: 'card_number' },
  year: { source: 'year' },
  vendor: { source: 'vendor' },
};

/**
 * Apply field mappings to transform intake item data into label data
 */
export function applyFieldMappings(
  item: Record<string, unknown>,
  mappings: FieldMappings = DEFAULT_FIELD_MAPPINGS
): SampleData {
  const result: SampleData = {
    title: '',
    sku: '',
    price: '',
    condition: '',
    barcode: '',
    set: '',
    cardNumber: '',
    year: '',
    vendor: '',
  };

  for (const [labelField, mapping] of Object.entries(mappings)) {
    if (!(labelField in result)) continue;
    
    const sourceValue = item[mapping.source];
    let value = sourceValue != null ? String(sourceValue) : '';
    
    // Combine with secondary source (used for title field)
    if (mapping.source2) {
      const sourceValue2 = item[mapping.source2];
      const value2 = sourceValue2 != null ? String(sourceValue2) : '';
      if (value2) {
        const separator = mapping.separator ?? ' - ';
        value = value ? value + separator + value2 : value2;
      }
    }

    // Apply format transformations
    if (mapping.format === 'currency' && value) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        value = `$${numValue.toFixed(2)}`;
      }
    } else if (mapping.format === 'uppercase') {
      value = value.toUpperCase();
    } else if (mapping.format === 'lowercase') {
      value = value.toLowerCase();
    }

    // Apply abbreviations for condition field
    if (mapping.abbreviate && value) {
      const abbrevs = mapping.abbreviations || CONDITION_ABBREVIATIONS;
      // Try exact match first
      if (abbrevs[value]) {
        value = abbrevs[value];
      } else {
        // Try case-insensitive match
        const lowerValue = value.toLowerCase();
        for (const [full, abbrev] of Object.entries(abbrevs)) {
          if (full.toLowerCase() === lowerValue) {
            value = abbrev;
            break;
          }
        }
      }
    }

    (result as unknown as Record<string, string>)[labelField] = value;
  }

  // Ensure barcode has a fallback to SKU
  if (!result.barcode && result.sku) {
    result.barcode = result.sku;
  }

  return result;
}

/**
 * Abbreviate a condition string using standard abbreviations
 */
export function abbreviateCondition(condition: string): string {
  if (!condition) return '';
  
  // Try exact match first
  if (CONDITION_ABBREVIATIONS[condition]) {
    return CONDITION_ABBREVIATIONS[condition];
  }
  
  // Try case-insensitive match
  const lowerCondition = condition.toLowerCase();
  for (const [full, abbrev] of Object.entries(CONDITION_ABBREVIATIONS)) {
    if (full.toLowerCase() === lowerCondition) {
      return abbrev;
    }
  }
  
  // Return first 3 characters as fallback
  return condition.substring(0, 3).toUpperCase();
}
