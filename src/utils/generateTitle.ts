/**
 * Unified title generation for inventory items.
 * 
 * Four paths based on category + grading status:
 * 
 * | Type          | Format                                                    |
 * |---------------|-----------------------------------------------------------|
 * | Graded Card   | YEAR BRAND SUBJECT #NUMBER VARIANT COMPANY GRADE          |
 * | Raw Card      | YEAR BRAND SUBJECT #NUMBER CONDITION                      |
 * | Graded Comic  | PUBLISHER TITLE #ISSUE MONTH YEAR VARIANT COMPANY GRADE   |
 * | Raw Comic     | PUBLISHER TITLE #ISSUE MONTH YEAR CONDITION               |
 */

// ── Constants ──

/** Variants to skip for graded items (add no meaningful info) */
const SKIP_VARIANTS = new Set(['normal', 'none', 'n/a', 'base', 'standard']);

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── Input interface ──

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
  main_category?: string | null;
  mainCategory?: string | null;
  catalog_snapshot?: Record<string, unknown> | null;
  psa_snapshot?: Record<string, unknown> | null;
}

// ── Helpers ──

function safeStr(...vals: Array<string | number | null | undefined>): string {
  for (const v of vals) {
    if (v != null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return '';
}

/** Deduplicate words across all parts while preserving original casing */
function deduplicateParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const words = part.split(/\s+/);
    const kept: string[] = [];
    for (const word of words) {
      const lower = word.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        kept.push(word);
      }
    }
    if (kept.length > 0) {
      result.push(kept.join(' '));
    }
  }
  return result;
}

function cleanVariant(v?: string | null): string {
  if (!v) return '';
  const cleaned = v.trim();
  if (/^(none|n\/a|na|-)$/i.test(cleaned)) return '';
  return cleaned;
}

function formatIssueNumber(num?: string | number | null): string {
  if (num == null) return '';
  const n = String(num).trim().replace(/^#/, '');
  if (!n || /^0+$/.test(n)) return '';
  return `#${n}`;
}

function parsePublicationDate(dateStr?: string | null): { month: string; year: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.trim().match(/^(\d{4})-(\d{1,2})/);
  if (!m) {
    const yearOnly = dateStr.trim().match(/^(\d{4})$/);
    if (yearOnly) return { month: '', year: yearOnly[1] };
    return null;
  }
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return { month: MONTH_NAMES[monthIdx], year: m[1] };
}

// ── Classification ──

function isGradedItem(item: TitleInput): boolean {
  const hasCert = !!(item.psa_cert || item.psaCert || item.cgc_cert || item.cgcCert);
  const hasGrade = !!item.grade;
  if (item.type === 'raw' || item.type === 'Raw') return false;
  return hasGrade || hasCert;
}

function isComicItem(item: TitleInput): boolean {
  const category = item.main_category || item.mainCategory;
  if (category === 'comics') return true;
  const snap = item.catalog_snapshot || item.psa_snapshot;
  return (snap as any)?.type === 'graded_comic';
}

// ── Title Builders ──

/**
 * Graded Card: YEAR BRAND SUBJECT #NUMBER VARIANT COMPANY GRADE
 */
function buildGradedCardTitle(item: TitleInput): string {
  const snap = item.catalog_snapshot;
  const parts: string[] = [];

  const year = safeStr(item.year, snap?.year as string);
  const brand = safeStr(item.brand_title, item.brandTitle);
  const subject = safeStr(item.subject);
  const cardNumber = safeStr(item.card_number, item.cardNumber);
  const variant = cleanVariant(
    item.variant || (snap?.varietyPedigree as string)
  );
  const grade = safeStr(item.grade);
  const company = safeStr(item.grading_company, item.gradingCompany) || 'PSA';

  if (year) parts.push(year);
  if (brand) parts.push(brand);
  if (subject) parts.push(subject);
  if (cardNumber) parts.push(`#${cardNumber}`);
  if (variant && !SKIP_VARIANTS.has(variant.toLowerCase().trim())) {
    parts.push(variant);
  }
  if (grade) parts.push(`${company} ${grade}`);

  return deduplicateParts(parts).join(' ') || 'Unknown Item';
}

/**
 * Raw Card: YEAR BRAND SUBJECT #NUMBER CONDITION
 */
function buildRawCardTitle(item: TitleInput): string {
  const snap = item.catalog_snapshot;
  const parts: string[] = [];

  const year = safeStr(item.year, snap?.year as string);
  const brand = safeStr(item.brand_title, item.brandTitle);
  const subject = safeStr(item.subject);
  const cardNumber = safeStr(item.card_number, item.cardNumber);
  const condition = safeStr(item.variant); // variant = condition for raw

  if (year) parts.push(year);
  if (brand) parts.push(brand);
  if (subject) parts.push(subject);
  if (cardNumber) parts.push(`#${cardNumber}`);
  if (condition) parts.push(condition);

  return deduplicateParts(parts).join(' ') || 'Unknown Item';
}

/**
 * Graded Comic: PUBLISHER TITLE #ISSUE MONTH YEAR VARIANT COMPANY GRADE
 */
function buildGradedComicTitle(item: TitleInput): string {
  const snap = (item.catalog_snapshot || item.psa_snapshot || {}) as Record<string, any>;
  const parts: string[] = [];

  const publisher = safeStr(snap.brandTitle, item.brand_title, item.brandTitle);
  const comicName = safeStr(snap.subject, item.subject);
  const issueNum = formatIssueNumber(snap.issueNumber || snap.cardNumber || item.card_number || item.cardNumber);
  const variant = cleanVariant(snap.varietyPedigree || item.variant);
  const grade = safeStr(item.grade);
  const company = safeStr(item.grading_company, item.gradingCompany) || 'PSA';
  const pubDate = parsePublicationDate(snap.publicationDate || snap.year || safeStr(item.year));

  if (publisher) parts.push(publisher);
  if (comicName) parts.push(comicName);
  if (issueNum) parts.push(issueNum);
  if (pubDate) {
    if (pubDate.month) parts.push(pubDate.month);
    parts.push(pubDate.year);
  }
  if (variant && !SKIP_VARIANTS.has(variant.toLowerCase().trim())) {
    parts.push(variant);
  }
  if (grade) parts.push(`${company} ${grade}`);

  return deduplicateParts(parts).join(' ') || 'Unknown Item';
}

/**
 * Raw Comic: PUBLISHER TITLE #ISSUE MONTH YEAR CONDITION
 */
function buildRawComicTitle(item: TitleInput): string {
  const snap = (item.catalog_snapshot || item.psa_snapshot || {}) as Record<string, any>;
  const parts: string[] = [];

  const publisher = safeStr(snap.brandTitle, item.brand_title, item.brandTitle);
  const comicName = safeStr(snap.subject, item.subject);
  const issueNum = formatIssueNumber(snap.issueNumber || snap.cardNumber || item.card_number || item.cardNumber);
  const condition = safeStr(item.variant); // variant = condition for raw
  const pubDate = parsePublicationDate(snap.publicationDate || snap.year || safeStr(item.year));

  if (publisher) parts.push(publisher);
  if (comicName) parts.push(comicName);
  if (issueNum) parts.push(issueNum);
  if (pubDate) {
    if (pubDate.month) parts.push(pubDate.month);
    parts.push(pubDate.year);
  }
  if (condition) parts.push(condition);

  return deduplicateParts(parts).join(' ') || 'Unknown Item';
}

// ── Public API ──

/**
 * Generate a display title for an inventory item.
 * Automatically routes to the correct builder based on category and grading status.
 */
export function generateTitle(item: TitleInput): string {
  const comic = isComicItem(item);
  const graded = isGradedItem(item);

  if (comic && graded) return buildGradedComicTitle(item);
  if (comic && !graded) return buildRawComicTitle(item);
  if (graded) return buildGradedCardTitle(item);
  return buildRawCardTitle(item);
}

/** Re-export helpers for testing / external use */
export { isGradedItem, isComicItem };
