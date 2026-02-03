/**
 * Test Data Generator for E2E Testing
 * Generates realistic inventory items with TEST- prefix for safe testing
 */

import { v4 as uuidv4 } from 'uuid';

// Trading card data samples for realistic test data
const BRANDS = ['Pokemon', 'Magic: The Gathering', 'Yu-Gi-Oh!', 'Sports Cards', 'Dragon Ball Z'];
const POKEMON_SUBJECTS = ['Charizard', 'Pikachu', 'Mewtwo', 'Blastoise', 'Venusaur', 'Gengar', 'Dragonite'];
const MTG_SUBJECTS = ['Black Lotus', 'Mox Ruby', 'Force of Will', 'Jace, the Mind Sculptor', 'Liliana of the Veil'];
const YUGIOH_SUBJECTS = ['Blue-Eyes White Dragon', 'Dark Magician', 'Exodia', 'Red-Eyes Black Dragon'];
const SPORTS_SUBJECTS = ['Michael Jordan', 'LeBron James', 'Mike Trout', 'Patrick Mahomes'];
const DBZ_SUBJECTS = ['Goku', 'Vegeta', 'Frieza', 'Cell', 'Gohan'];

const VARIANTS = ['Base Set', 'First Edition', 'Shadowless', 'Holo', 'Reverse Holo', 'Gold Star', 'Normal'];
const GRADES = ['10', '9', '8', '7', '6'];
const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'SGC'];
const CATEGORIES = ['Trading Card Games', 'Sports Cards', 'Collectibles'];
const MAIN_CATEGORIES = ['cards', 'sealed', 'memorabilia'];
const SUB_CATEGORIES = ['graded', 'raw', 'booster', 'pack'];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPrice(min: number = 10, max: number = 500): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomYear(): string {
  const years = ['1999', '2000', '2005', '2016', '2019', '2020', '2021', '2022', '2023'];
  return randomElement(years);
}

function generateRandomString(length: number = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateCardNumber(): string {
  return String(Math.floor(Math.random() * 300) + 1).padStart(3, '0');
}

function generateCertNumber(company: string): string {
  const base = Math.floor(Math.random() * 90000000) + 10000000;
  return base.toString();
}

export interface TestIntakeItem {
  id: string;
  sku: string;
  store_key: string;
  shopify_location_gid: string;
  brand_title: string;
  subject: string;
  variant: string;
  card_number: string;
  year: string;
  category: string;
  main_category: string;
  sub_category: string;
  price: number;
  cost: number;
  quantity: number;
  type: 'Graded' | 'Raw';
  grade: string | null;
  grading_company: string;
  psa_cert: string | null;
  cgc_cert: string | null;
  lot_number: string;
  list_on_shopify: boolean;
  list_on_ebay: boolean;
  unique_item_uid: string;
  vendor: string | null;
  processing_notes: string | null;
}

export interface TestGeneratorOptions {
  storeKey?: string;
  shopifyLocationGid?: string;
  gradedOnly?: boolean;
  rawOnly?: boolean;
  priceRange?: { min: number; max: number };
}

/**
 * Generate a single test inventory item
 */
export function generateTestItem(options: TestGeneratorOptions = {}): TestIntakeItem {
  const {
    storeKey = 'hawaii',
    shopifyLocationGid = 'gid://shopify/Location/68739530925',
    gradedOnly = false,
    rawOnly = false,
    priceRange = { min: 10, max: 500 }
  } = options;

  const id = uuidv4();
  const sku = `TEST-${generateRandomString(6)}`;
  const brand = randomElement(BRANDS);
  
  // Pick subject based on brand
  let subject: string;
  switch (brand) {
    case 'Pokemon':
      subject = randomElement(POKEMON_SUBJECTS);
      break;
    case 'Magic: The Gathering':
      subject = randomElement(MTG_SUBJECTS);
      break;
    case 'Yu-Gi-Oh!':
      subject = randomElement(YUGIOH_SUBJECTS);
      break;
    case 'Sports Cards':
      subject = randomElement(SPORTS_SUBJECTS);
      break;
    case 'Dragon Ball Z':
      subject = randomElement(DBZ_SUBJECTS);
      break;
    default:
      subject = randomElement(POKEMON_SUBJECTS);
  }

  // Determine if graded or raw
  let isGraded: boolean;
  if (gradedOnly) {
    isGraded = true;
  } else if (rawOnly) {
    isGraded = false;
  } else {
    isGraded = Math.random() > 0.3; // 70% graded for testing
  }

  const gradingCompany = isGraded ? randomElement(GRADING_COMPANIES) : 'Raw';
  const grade = isGraded ? randomElement(GRADES) : null;
  const certNumber = isGraded ? generateCertNumber(gradingCompany) : null;
  
  const price = randomPrice(priceRange.min, priceRange.max);
  const cost = Math.round(price * 0.4 * 100) / 100; // 40% of price as cost

  return {
    id,
    sku,
    store_key: storeKey,
    shopify_location_gid: shopifyLocationGid,
    brand_title: brand,
    subject,
    variant: randomElement(VARIANTS),
    card_number: generateCardNumber(),
    year: randomYear(),
    category: randomElement(CATEGORIES),
    main_category: randomElement(MAIN_CATEGORIES),
    sub_category: isGraded ? 'graded' : 'raw',
    price,
    cost,
    quantity: 1, // Always 1 for graded cards
    type: isGraded ? 'Graded' : 'Raw',
    grade,
    grading_company: gradingCompany,
    psa_cert: gradingCompany === 'PSA' ? certNumber : null,
    cgc_cert: gradingCompany === 'CGC' ? certNumber : null,
    lot_number: `TEST-LOT-${generateRandomString(4)}`,
    list_on_shopify: true,
    list_on_ebay: true,
    unique_item_uid: uuidv4(),
    vendor: 'Test Vendor',
    processing_notes: 'E2E Test Item - Safe to delete'
  };
}

/**
 * Generate multiple test inventory items
 */
export function generateTestItems(count: number, options: TestGeneratorOptions = {}): TestIntakeItem[] {
  return Array.from({ length: count }, () => generateTestItem(options));
}

/**
 * Build a realistic title for a test item (matches Shopify sync format)
 */
export function buildTestItemTitle(item: TestIntakeItem): string {
  const parts: string[] = [];
  
  if (item.year) parts.push(item.year);
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  if (item.card_number) parts.push(`#${item.card_number}`);
  if (item.variant && item.variant !== 'Normal') parts.push(item.variant);
  if (item.type === 'Graded' && item.grade) {
    parts.push(`${item.grading_company} ${item.grade}`);
  }
  
  return parts.join(' ');
}

/**
 * Build label data for printing from a test item
 */
export function buildLabelDataFromTestItem(item: TestIntakeItem): Record<string, string> {
  return {
    CARDNAME: item.subject,
    SETNAME: item.brand_title,
    CARDNUMBER: item.card_number,
    CONDITION: item.type === 'Graded' ? `${item.grading_company} ${item.grade}` : 'Raw',
    PRICE: `$${item.price.toFixed(2)}`,
    SKU: item.sku,
    BARCODE: item.psa_cert || item.cgc_cert || item.sku,
    VENDOR: item.vendor || '',
    YEAR: item.year,
    CATEGORY: item.category
  };
}
