/**
 * Deterministic Shopify handle and SKU generation
 * Ensures consistent IDs for idempotent operations
 */

export interface CardIdentifiers {
  game: string;
  setCode: string;
  number: string;
  finish: "holo" | "nonholo" | string;
  grade?: string;
  condition?: string;
}

export function buildHandle(card: CardIdentifiers): string {
  const normalize = (s: string) => 
    s.toLowerCase()
     .replace(/[^a-z0-9]+/g, "-")
     .replace(/(^-|-$)/g, "");
  
  const parts = [
    card.game,
    card.setCode, 
    card.number,
    card.finish
  ];
  
  if (card.grade) parts.push(card.grade);
  if (card.condition) parts.push(card.condition);
  
  return normalize(parts.join("-"));
}

export function buildSku(card: Pick<CardIdentifiers, 'setCode' | 'number' | 'finish' | 'grade' | 'condition'>): string {
  const parts = [
    card.setCode,
    card.number,
    card.finish
  ];
  
  if (card.grade) parts.push(card.grade);
  if (card.condition) parts.push(card.condition);
  
  return parts.join("-").toUpperCase();
}

// Metafield constants for tracking external IDs
export const META_NS = "acs.sync";

// Metafield type definitions
export const METAFIELD_TYPES = {
  TEXT: "single_line_text_field",
  MULTILINE: "multi_line_text_field",
  NUMBER: "number_integer",
  DECIMAL: "number_decimal",
  JSON: "json",
  URL: "url",
  BOOLEAN: "boolean",
  DATE: "date",
  LIST_TEXT: "list.single_line_text_field"
} as const;

// Metafield keys for comprehensive product data
export const META_KEYS = {
  // Tracking
  EXTERNAL_ID: "external_id",
  INTAKE_ID: "intake_id",
  
  // Core Classification
  MAIN_CATEGORY: "main_category",      // tcg, sports, comics
  SUB_CATEGORY: "sub_category",        // pokemon, baseball, mtg, marvel, etc.
  ITEM_TYPE: "item_type",              // graded, raw
  
  // Grading Info
  GRADING_COMPANY: "grading_company",  // PSA, CGC, BGS
  GRADE: "grade",                      // 10, 9, Mint, etc.
  CERT_NUMBER: "cert_number",          // Certificate number
  CERT_URL: "cert_url",                // Verification URL
  
  // Card Details
  BRAND_TITLE: "brand_title",          // Set name (Base Set, 1989 Topps)
  CARD_NUMBER: "card_number",          // Card number in set
  YEAR: "year",                        // Release year
  VARIANT: "variant",                  // Holo, First Edition, etc.
  SUBJECT: "subject",                  // Player/character name
  RARITY: "rarity",                    // Card rarity
  
  // Rich Data (JSON)
  CATALOG_SNAPSHOT: "catalog_snapshot",
  PSA_SNAPSHOT: "psa_snapshot",
  GRADING_DATA: "grading_data",
} as const;

export const META_KEY_EXTERNAL_ID = META_KEYS.EXTERNAL_ID;
export const META_KEY_INTAKE_ID = META_KEYS.INTAKE_ID;

interface MetafieldInput {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

// Enhanced builder with comprehensive card-specific data
export function buildExtendedMetafields(params: {
  externalId: string;
  intakeId?: string;
  mainCategory?: string;
  subCategory?: string;
  itemType?: string;
  gradingCompany?: string;
  grade?: string;
  certNumber?: string;
  certUrl?: string;
  brandTitle?: string;
  cardNumber?: string;
  year?: string;
  variant?: string;
  subject?: string;
  rarity?: string;
  catalogSnapshot?: object;
  psaSnapshot?: object;
  gradingData?: object;
}): MetafieldInput[] {
  const metafields: MetafieldInput[] = [
    {
      namespace: META_NS,
      key: META_KEYS.EXTERNAL_ID,
      type: METAFIELD_TYPES.TEXT,
      value: params.externalId,
    }
  ];

  // Add optional fields only if they have values
  if (params.intakeId) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.INTAKE_ID,
      type: METAFIELD_TYPES.TEXT,
      value: params.intakeId,
    });
  }

  // Core classification
  if (params.mainCategory) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.MAIN_CATEGORY,
      type: METAFIELD_TYPES.TEXT,
      value: params.mainCategory,
    });
  }

  if (params.subCategory) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.SUB_CATEGORY,
      type: METAFIELD_TYPES.TEXT,
      value: params.subCategory,
    });
  }

  if (params.itemType) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.ITEM_TYPE,
      type: METAFIELD_TYPES.TEXT,
      value: params.itemType,
    });
  }

  // Grading information
  if (params.gradingCompany) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.GRADING_COMPANY,
      type: METAFIELD_TYPES.TEXT,
      value: params.gradingCompany,
    });
  }

  if (params.grade) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.GRADE,
      type: METAFIELD_TYPES.TEXT,
      value: params.grade,
    });
  }

  if (params.certNumber) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.CERT_NUMBER,
      type: METAFIELD_TYPES.TEXT,
      value: params.certNumber,
    });
  }

  if (params.certUrl) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.CERT_URL,
      type: METAFIELD_TYPES.URL,
      value: params.certUrl,
    });
  }

  // Card details
  if (params.brandTitle) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.BRAND_TITLE,
      type: METAFIELD_TYPES.TEXT,
      value: params.brandTitle,
    });
  }

  if (params.cardNumber) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.CARD_NUMBER,
      type: METAFIELD_TYPES.TEXT,
      value: params.cardNumber,
    });
  }

  if (params.year) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.YEAR,
      type: METAFIELD_TYPES.TEXT,
      value: params.year,
    });
  }

  if (params.variant) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.VARIANT,
      type: METAFIELD_TYPES.TEXT,
      value: params.variant,
    });
  }

  if (params.subject) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.SUBJECT,
      type: METAFIELD_TYPES.TEXT,
      value: params.subject,
    });
  }

  if (params.rarity) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.RARITY,
      type: METAFIELD_TYPES.TEXT,
      value: params.rarity,
    });
  }

  // Rich JSON data (stored as stringified JSON)
  if (params.catalogSnapshot) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.CATALOG_SNAPSHOT,
      type: METAFIELD_TYPES.JSON,
      value: JSON.stringify(params.catalogSnapshot),
    });
  }

  if (params.psaSnapshot) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.PSA_SNAPSHOT,
      type: METAFIELD_TYPES.JSON,
      value: JSON.stringify(params.psaSnapshot),
    });
  }

  if (params.gradingData) {
    metafields.push({
      namespace: META_NS,
      key: META_KEYS.GRADING_DATA,
      type: METAFIELD_TYPES.JSON,
      value: JSON.stringify(params.gradingData),
    });
  }

  return metafields;
}

// Keep old function for backward compatibility
export function buildMetafields(externalId: string, intakeId?: string) {
  return buildExtendedMetafields({ externalId, intakeId });
}