/**
 * Client-side eBay listing preview resolver.
 * Mirrors the edge function logic in ebayTemplateResolver.ts for browser-side preview.
 * This is a read-only simulation — the actual listing still goes through the edge function.
 */

// Types matching the database schema
export interface CategoryMapping {
  id: string;
  store_key: string;
  category_id: string;
  category_name: string;
  brand_match: string[] | null;
  keyword_pattern: string | null;
  main_category: string | null;
  default_template_id: string | null;
  priority: number | null;
  is_active: boolean | null;
}

export interface ListingTemplate {
  id: string;
  store_key: string;
  name: string;
  category_id: string;
  category_name: string | null;
  condition_id: string;
  is_graded: boolean | null;
  is_default: boolean | null;
  is_active: boolean | null;
  title_template: string | null;
  description_template: string | null;
  aspects_mapping: any;
  fulfillment_policy_id: string | null;
  payment_policy_id: string | null;
  return_policy_id: string | null;
  default_grader: string | null;
}

export interface EbayCategory {
  id: string;
  name: string;
  item_type: string | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface PolicyRecord {
  id: string;
  policy_id: string;
  name: string;
}

export interface PreviewItem {
  id: string;
  sku: string | null;
  psa_cert: string | null;
  cgc_cert?: string | null;
  brand_title: string | null;
  subject: string | null;
  main_category: string | null;
  price: number | null;
  grade: string | null;
  grading_company?: string;
  year?: string | null;
  card_number?: string | null;
  variant?: string | null;
  image_urls?: any;
  list_on_ebay: boolean | null;
  ebay_listing_id: string | null;
}

export interface StoreConfig {
  price_markup_percent: number | null;
  default_fulfillment_policy_id: string | null;
  default_payment_policy_id: string | null;
  default_return_policy_id: string | null;
  default_category_id: string | null;
  default_condition_id: string | null;
}

export interface ResolvedListing {
  item: PreviewItem;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  conditionId: string;
  conditionName: string;
  detectedType: 'tcg' | 'sports' | 'comics' | null;
  templateName: string | null;
  templateMatchSource: 'brand_mapping' | 'category_mapping' | 'graded_fallback' | 'default' | 'none';
  aspects: Record<string, string[]>;
  basePrice: number;
  finalPrice: number;
  markupPercent: number;
  fulfillmentPolicyName: string | null;
  paymentPolicyName: string | null;
  returnPolicyName: string | null;
  warnings: string[];
  imageUrls: string[];
}

// ── Category Detection ──

export function detectCategoryFromBrand(
  brand: string | null | undefined,
  mappings: CategoryMapping[]
): 'tcg' | 'sports' | 'comics' | null {
  if (!brand) return null;
  const brandLower = brand.toLowerCase();

  // Sort by priority descending (higher priority first)
  const sorted = [...mappings]
    .filter(m => m.is_active && m.brand_match?.length && m.main_category)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const mapping of sorted) {
    const matched = mapping.brand_match!.some((b) =>
      brandLower.includes(b.toLowerCase())
    );
    if (matched) {
      return mapping.main_category as 'tcg' | 'sports' | 'comics';
    }
  }

  return null;
}

// ── Category ID Lookup ──

export function getCategoryId(
  category: string | null,
  isGraded: boolean,
  categories: EbayCategory[]
): { id: string; name: string } {
  if (!category) {
    return { id: '183454', name: 'CCG Individual Cards' };
  }

  const matching = categories
    .filter(c => c.item_type === category && c.is_active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (matching.length > 0) {
    if (category === 'comics' && matching.length > 1) {
      if (isGraded) {
        const graded = matching.find(c => c.name?.toLowerCase().includes('graded'));
        if (graded) return { id: graded.id, name: graded.name };
      } else {
        const ungraded = matching.find(c => !c.name?.toLowerCase().includes('graded'));
        if (ungraded) return { id: ungraded.id, name: ungraded.name };
      }
    }
    return { id: matching[0].id, name: matching[0].name };
  }

  // Hardcoded fallbacks
  const fallbacks: Record<string, { id: string; name: string }> = {
    tcg: { id: '183454', name: 'CCG Individual Cards' },
    sports: { id: '261328', name: 'Sports Trading Cards' },
    comics: isGraded
      ? { id: '259061', name: 'Graded Comic Books' }
      : { id: '63', name: 'Comic Books' },
  };
  return fallbacks[category] || fallbacks.tcg;
}

// ── Template Resolution ──

export interface ResolvedTemplate {
  template: ListingTemplate | null;
  matchSource: ResolvedListing['templateMatchSource'];
}

export function resolveTemplateForItem(
  item: PreviewItem,
  templates: ListingTemplate[],
  mappings: CategoryMapping[],
  categories: EbayCategory[]
): ResolvedTemplate {
  const detectedCategory = detectCategoryFromBrand(item.brand_title, mappings) || item.main_category;
  const isGraded = !!item.grade;

  // 1. Category mappings — brand match
  for (const mapping of mappings.filter(m => m.is_active && m.default_template_id)) {
    if (mapping.brand_match?.length && item.brand_title) {
      const brandLower = item.brand_title.toLowerCase();
      if (mapping.brand_match.some(b => brandLower.includes(b.toLowerCase()))) {
        const tmpl = templates.find(t => t.id === mapping.default_template_id && t.is_active);
        if (tmpl) return { template: tmpl, matchSource: 'brand_mapping' };
      }
    }
    if (mapping.main_category && detectedCategory && mapping.main_category === detectedCategory) {
      const tmpl = templates.find(t => t.id === mapping.default_template_id && t.is_active);
      if (tmpl) return { template: tmpl, matchSource: 'category_mapping' };
    }
    if (mapping.keyword_pattern && (item.brand_title || item.subject)) {
      try {
        const re = new RegExp(mapping.keyword_pattern, 'i');
        if (re.test(item.brand_title || '') || re.test(item.subject || '')) {
          const tmpl = templates.find(t => t.id === mapping.default_template_id && t.is_active);
          if (tmpl) return { template: tmpl, matchSource: 'category_mapping' };
        }
      } catch { /* ignore bad regex */ }
    }
  }

  // 2. Graded status + category match
  const activeTemplates = templates.filter(t => t.is_active && (t.is_graded ?? false) === isGraded);
  if (detectedCategory && activeTemplates.length > 0) {
    const categoryIds = new Set(
      categories.filter(c => c.item_type === detectedCategory && c.is_active).map(c => c.id)
    );
    const matched = activeTemplates.find(t => categoryIds.has(t.category_id));
    if (matched) return { template: matched, matchSource: 'graded_fallback' };
  }

  // 3. Default template
  const defaultTemplate = activeTemplates.find(t => t.is_default) || activeTemplates[0];
  if (defaultTemplate) return { template: defaultTemplate, matchSource: 'default' };

  // 4. Any active template at all
  const anyTemplate = templates.find(t => t.is_active && t.is_default) || templates.find(t => t.is_active);
  if (anyTemplate) return { template: anyTemplate, matchSource: 'default' };

  return { template: null, matchSource: 'none' };
}

// ── Title Building ──

export function buildPreviewTitle(item: PreviewItem, template?: string | null): string {
  if (template) {
    return template
      .replace(/{subject}/g, item.subject || '')
      .replace(/{brand_title}/g, item.brand_title || '')
      .replace(/{brand}/g, item.brand_title || '')
      .replace(/{year}/g, item.year || '')
      .replace(/{grade}/g, item.grade || '')
      .replace(/{grading_company}/g, item.grading_company || '')
      .replace(/{card_number}/g, item.card_number || '')
      .replace(/{variant}/g, item.variant || '')
      .replace(/{psa_cert}/g, item.psa_cert || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const parts: string[] = [];
  if (item.year) parts.push(item.year);
  if (item.brand_title) parts.push(item.brand_title);
  if (item.subject) parts.push(item.subject);
  if (item.card_number) parts.push(`#${item.card_number}`);
  if (item.grade && item.grading_company) {
    parts.push(`${item.grading_company} ${item.grade}`);
  } else if (item.grade) {
    parts.push(`PSA ${item.grade}`);
  }
  return parts.join(' ') || 'Trading Card';
}

// ── Description Building ──

export function buildPreviewDescription(item: PreviewItem, template?: string | null): string {
  if (template) {
    return template
      .replace(/{subject}/g, item.subject || '')
      .replace(/{brand_title}/g, item.brand_title || '')
      .replace(/{brand}/g, item.brand_title || '')
      .replace(/{year}/g, item.year || '')
      .replace(/{grade}/g, item.grade || '')
      .replace(/{grading_company}/g, item.grading_company || '')
      .replace(/{card_number}/g, item.card_number || '')
      .replace(/{variant}/g, item.variant || '')
      .replace(/{sku}/g, item.sku || '')
      .replace(/{psa_cert}/g, item.psa_cert || '')
      .replace(/{cgc_cert}/g, item.cgc_cert || '')
      .trim();
  }

  const lines: string[] = [`<h2>${item.subject || 'Trading Card'}</h2>`];
  if (item.brand_title) lines.push(`<p><strong>Brand:</strong> ${item.brand_title}</p>`);
  if (item.year) lines.push(`<p><strong>Year:</strong> ${item.year}</p>`);
  if (item.card_number) lines.push(`<p><strong>Card #:</strong> ${item.card_number}</p>`);
  if (item.variant) lines.push(`<p><strong>Variant:</strong> ${item.variant}</p>`);
  if (item.grade) {
    const grader = item.grading_company || 'PSA';
    lines.push(`<p><strong>Grade:</strong> ${grader} ${item.grade}</p>`);
  }
  if (item.psa_cert) lines.push(`<p><strong>PSA Cert:</strong> ${item.psa_cert}</p>`);
  if (item.cgc_cert) lines.push(`<p><strong>CGC Cert:</strong> ${item.cgc_cert}</p>`);
  return lines.join('\n');
}

// ── Aspect Builders ──

export function buildPreviewAspects(
  item: PreviewItem,
  detectedCategory: string | null
): Record<string, string[]> {
  switch (detectedCategory) {
    case 'sports':
      return buildSportsAspects(item);
    case 'comics':
      return buildComicAspects(item);
    case 'tcg':
    default:
      return buildTcgAspects(item);
  }
}

function buildTcgAspects(item: PreviewItem): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};
  if (item.year) aspects['Year Manufactured'] = [item.year];
  if (item.subject) {
    aspects['Character'] = [item.subject];
    aspects['Card Name'] = [item.subject];
  }
  if (item.brand_title) {
    aspects['Manufacturer'] = [item.brand_title];
    aspects['Set'] = [item.brand_title];
  }
  if (item.card_number) aspects['Card Number'] = [String(item.card_number)];
  if (item.variant) aspects['Parallel/Variety'] = [item.variant];
  if (item.grade && item.grading_company) {
    aspects['Professional Grader'] = [item.grading_company];
    aspects['Grade'] = [item.grade];
  }
  if (item.psa_cert) aspects['Certification Number'] = [item.psa_cert];
  return aspects;
}

function buildSportsAspects(item: PreviewItem): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};
  if (item.year) {
    aspects['Year Manufactured'] = [item.year];
    aspects['Season'] = [item.year];
  }
  if (item.subject) aspects['Player/Athlete'] = [item.subject];
  if (item.brand_title) {
    aspects['Manufacturer'] = [item.brand_title];
    aspects['Set'] = [item.brand_title];
  }
  if (item.card_number) aspects['Card Number'] = [String(item.card_number)];
  if (item.variant) aspects['Parallel/Variety'] = [item.variant];
  if (item.grade && item.grading_company) {
    aspects['Professional Grader'] = [item.grading_company];
    aspects['Grade'] = [item.grade];
  }
  if (item.psa_cert) aspects['Certification Number'] = [item.psa_cert];
  aspects['Card Condition'] = item.grade ? ['Graded'] : ['Ungraded'];
  aspects['Original/Reprint'] = ['Original'];
  return aspects;
}

function buildComicAspects(item: PreviewItem): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};
  if (item.year) aspects['Publication Year'] = [item.year];
  if (item.subject) aspects['Title'] = [item.subject];
  if (item.brand_title) aspects['Publisher'] = [item.brand_title];
  if (item.card_number) aspects['Issue Number'] = [String(item.card_number)];
  if (item.variant) aspects['Variant Cover'] = [item.variant];
  if (item.grade && item.grading_company) {
    aspects['Grader'] = [item.grading_company];
    aspects['Grade'] = [item.grade];
  }
  if (item.cgc_cert) aspects['Certification Number'] = [item.cgc_cert];
  aspects['Format'] = ['Single Issue'];
  aspects['Type'] = ['Comic Book'];
  return aspects;
}

// ── Price Calculation ──

export function calculateFinalPrice(basePrice: number | null, markupPercent: number): number {
  if (basePrice == null || basePrice <= 0) return 0;
  return basePrice * (1 + markupPercent / 100);
}

// ── Image URL Extraction ──

export function extractImageUrls(imageUrlsField: any): string[] {
  if (!imageUrlsField) return [];
  if (Array.isArray(imageUrlsField)) return imageUrlsField.filter(u => typeof u === 'string');
  if (typeof imageUrlsField === 'string') {
    try {
      const parsed = JSON.parse(imageUrlsField);
      if (Array.isArray(parsed)) return parsed.filter(u => typeof u === 'string');
    } catch { /* ignore */ }
  }
  return [];
}

// ── Full Resolution ──

export function resolveListingPreview(
  item: PreviewItem,
  templates: ListingTemplate[],
  mappings: CategoryMapping[],
  categories: EbayCategory[],
  storeConfig: StoreConfig,
  fulfillmentPolicies: PolicyRecord[],
  paymentPolicies: PolicyRecord[],
  returnPolicies: PolicyRecord[]
): ResolvedListing {
  const warnings: string[] = [];
  const isGraded = !!item.grade;
  const markupPercent = storeConfig.price_markup_percent ?? 0;

  // Detect category
  const detectedType = detectCategoryFromBrand(item.brand_title, mappings) || 
    (item.main_category as 'tcg' | 'sports' | 'comics' | null);

  // Resolve template
  const { template, matchSource } = resolveTemplateForItem(item, templates, mappings, categories);
  if (!template) warnings.push('No matching template found — using auto-generated defaults');

  // Category
  const { id: categoryId, name: categoryName } = template
    ? { id: template.category_id, name: template.category_name || 'Unknown' }
    : getCategoryId(detectedType, isGraded, categories);

  // Condition
  const conditionId = template?.condition_id || (isGraded ? '2750' : '4000');
  const conditionName = conditionId === '2750' ? 'Graded' : 'Ungraded';

  // Title & Description
  const title = buildPreviewTitle(item, template?.title_template);
  const description = buildPreviewDescription(item, template?.description_template);

  // Aspects
  const aspects = buildPreviewAspects(item, detectedType);

  // Price
  const basePrice = item.price ?? 0;
  const finalPrice = calculateFinalPrice(item.price, markupPercent);

  // Policies — template overrides > store defaults
  const fulfillmentPolicyId = template?.fulfillment_policy_id || storeConfig.default_fulfillment_policy_id;
  const paymentPolicyId = template?.payment_policy_id || storeConfig.default_payment_policy_id;
  const returnPolicyId = template?.return_policy_id || storeConfig.default_return_policy_id;

  const fulfillmentPolicyName = fulfillmentPolicies.find(p => p.policy_id === fulfillmentPolicyId)?.name || null;
  const paymentPolicyName = paymentPolicies.find(p => p.policy_id === paymentPolicyId)?.name || null;
  const returnPolicyName = returnPolicies.find(p => p.policy_id === returnPolicyId)?.name || null;

  // Images
  const imageUrls = extractImageUrls(item.image_urls);

  // Validation warnings
  if (basePrice <= 0) warnings.push('No price set');
  if (imageUrls.length === 0) warnings.push('No images');
  if (title.length > 80) warnings.push(`Title exceeds 80 chars (${title.length})`);
  if (!fulfillmentPolicyId) warnings.push('No shipping policy');
  if (!paymentPolicyId) warnings.push('No payment policy');
  if (!returnPolicyId) warnings.push('No return policy');

  return {
    item,
    title,
    description,
    categoryId,
    categoryName,
    conditionId,
    conditionName,
    detectedType: detectedType as 'tcg' | 'sports' | 'comics' | null,
    templateName: template?.name || null,
    templateMatchSource: matchSource,
    aspects,
    basePrice,
    finalPrice,
    markupPercent,
    fulfillmentPolicyName,
    paymentPolicyName,
    returnPolicyName,
    warnings,
    imageUrls,
  };
}
