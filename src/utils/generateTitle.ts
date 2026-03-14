/**
 * Unified title generation for inventory items.
 * Handles raw vs graded cards with different logic.
 * Single source of truth — used across all frontend surfaces and eBay fallback.
 */

/** Variants to skip for graded cards (these add no meaningful info) */
const SKIP_VARIANTS = new Set(['normal', 'none', 'n/a', 'base', 'standard']);

/** Fields the generator needs — works with both snake_case and camelCase shapes */
export interface TitleInput {
  year?: string | number | null;
  brand_title?: string | null;
  brandTitle?: string | null;
  subject?: string | null;
  card_number?: string | number | null;
  cardNumber?: string | number | null;
  variant?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  gradingCompany?: string | null;
  psa_cert?: string | null;
  psaCert?: string | null;
  cgc_cert?: string | null;
  cgcCert?: string | null;
  type?: string | null;
  catalog_snapshot?: Record<string, unknown> | null;
}

/** Deduplicate consecutive/repeated words while preserving original casing */
function deduplicateParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const words = part.split(/\s+/);
    const dedupedWords: string[] = [];
    for (const word of words) {
      const lower = word.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        dedupedWords.push(word);
      }
    }
    if (dedupedWords.length > 0) {
      result.push(dedupedWords.join(' '));
    }
  }
  return result;
}

/** Determine if an item is graded (has grade + cert) vs raw */
function isGradedItem(item: TitleInput): boolean {
  const hasCert = !!(item.psa_cert || item.psaCert || item.cgc_cert || item.cgcCert);
  const hasGrade = !!item.grade;
  // Explicitly raw type
  if (item.type === 'raw') return false;
  return hasGrade || hasCert;
}

/**
 * Generate a display title for an inventory item.
 * 
 * **Raw cards**: year brand subject #number variant(=condition)
 * **Graded cards**: year brand subject #number variant(filtered) COMPANY GRADE
 */
export function generateTitle(item: TitleInput): string {
  const parts: string[] = [];

  // Resolve fields (support both snake_case and camelCase)
  const catalogSnapshot = item.catalog_snapshot;
  const year = item.year || (catalogSnapshot?.year as string | undefined);
  const brand = item.brand_title || item.brandTitle;
  const subject = item.subject;
  const cardNumber = item.card_number || item.cardNumber;
  const variant = item.variant || (catalogSnapshot?.varietyPedigree as string | undefined);
  const grade = item.grade;
  const gradingCompany = item.grading_company || item.gradingCompany;

  // Common fields
  if (year) parts.push(String(year));
  if (brand) parts.push(brand);
  if (subject) parts.push(subject);
  if (cardNumber) parts.push(`#${cardNumber}`);

  const graded = isGradedItem(item);

  if (graded) {
    // Graded: include variant only if meaningful, then append grading info
    if (variant && !SKIP_VARIANTS.has(variant.toLowerCase().trim())) {
      parts.push(variant);
    }
    if (grade) {
      const company = gradingCompany || 'PSA';
      parts.push(`${company} ${grade}`);
    }
  } else {
    // Raw: variant acts as condition, include as-is
    if (variant) parts.push(variant);
  }

  const deduped = deduplicateParts(parts);
  return deduped.join(' ') || 'Unknown Item';
}
