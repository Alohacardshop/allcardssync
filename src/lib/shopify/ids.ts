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
export const META_KEY_EXTERNAL_ID = "external_id";
export const META_KEY_INTAKE_ID = "intake_id";

export function buildMetafields(externalId: string, intakeId?: string) {
  const metafields = [
    {
      namespace: META_NS,
      key: META_KEY_EXTERNAL_ID,
      type: "single_line_text_field",
      value: externalId,
    }
  ];
  
  if (intakeId) {
    metafields.push({
      namespace: META_NS,
      key: META_KEY_INTAKE_ID,
      type: "single_line_text_field", 
      value: intakeId,
    });
  }
  
  return metafields;
}