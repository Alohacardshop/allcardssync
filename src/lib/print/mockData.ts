/**
 * Stable Mock Data
 *
 * Single source of truth for test/development print payloads.
 * Use everywhere: test prints, storybook, unit tests, demo mode.
 */

import type { JobVars } from '@/lib/labels/types';

/** A realistic sample product for test prints and mock flows. */
export const MOCK_PRODUCT = {
  title: 'Charizard Holo 1st Edition',
  sku: 'ACS-PKM-004-NM',
  barcode: 'ACS-PKM-004-NM',
  price: '$349.99',
  condition: 'Near Mint',
  setName: 'Base Set',
  cardNumber: '4/102',
  vendor: 'Aloha Card Shop',
  year: '1999',
  category: 'Pokemon',
} as const;

/** Convert the mock product into JobVars for ZPL template resolution. */
export function getMockJobVars(): JobVars {
  return {
    CARDNAME: MOCK_PRODUCT.title,
    SKU: MOCK_PRODUCT.sku,
    BARCODE: MOCK_PRODUCT.barcode,
    PRICE: MOCK_PRODUCT.price,
    CONDITION: MOCK_PRODUCT.condition,
    SETNAME: MOCK_PRODUCT.setName,
    CARDNUMBER: MOCK_PRODUCT.cardNumber,
    VENDOR: MOCK_PRODUCT.vendor,
    YEAR: MOCK_PRODUCT.year,
    CATEGORY: MOCK_PRODUCT.category,
  };
}
