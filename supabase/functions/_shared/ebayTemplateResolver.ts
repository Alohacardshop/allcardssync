/**
 * Shared eBay template resolution, title/description building, and category-aware aspect selection.
 * Used by both ebay-create-listing and ebay-sync-processor to avoid logic duplication.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  detectCategoryFromBrand,
  getEbayCategoryId,
  buildTradingCardAspects,
  buildSportsCardAspects,
  buildComicAspects,
} from './ebayConditions.ts'

/**
 * Detect item category by querying ebay_category_mappings brand_match arrays.
 * Falls back to the hardcoded detectCategoryFromBrand() if no DB match found.
 */
export async function detectCategoryFromBrandDB(
  supabase: ReturnType<typeof createClient>,
  brand: string | null | undefined,
): Promise<'tcg' | 'sports' | 'comics' | null> {
  if (!brand) return null

  try {
    const { data: mappings } = await supabase
      .from('ebay_category_mappings')
      .select('brand_match, main_category')
      .eq('is_active', true)
      .not('main_category', 'is', null)
      .not('brand_match', 'is', null)
      .order('priority', { ascending: false })

    if (mappings && mappings.length > 0) {
      const brandLower = brand.toLowerCase()
      for (const mapping of mappings) {
        if (mapping.brand_match?.length) {
          const matched = mapping.brand_match.some((b: string) =>
            brandLower.includes(b.toLowerCase()),
          )
          if (matched && mapping.main_category) {
            return mapping.main_category as 'tcg' | 'sports' | 'comics'
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ebayTemplateResolver] detectCategoryFromBrandDB query failed, using hardcoded fallback:', err)
  }

  // Fallback to hardcoded detection
  return detectCategoryFromBrand(brand)
}

/**
 * Get eBay category ID by querying ebay_categories table by item_type.
 * Falls back to the hardcoded getEbayCategoryId() if no DB match found.
 */
export async function getEbayCategoryIdDB(
  supabase: ReturnType<typeof createClient>,
  category: 'tcg' | 'sports' | 'comics' | string | null,
  isGraded: boolean = false,
): Promise<string> {
  if (!category) {
    return getEbayCategoryId(null, isGraded)
  }

  try {
    let query = supabase
      .from('ebay_categories')
      .select('id, name')
      .eq('item_type', category)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const { data: categories } = await query

    if (categories && categories.length > 0) {
      // For comics, try to pick graded vs ungraded variant
      if (category === 'comics' && categories.length > 1) {
        if (isGraded) {
          const graded = categories.find((c: any) =>
            c.name?.toLowerCase().includes('graded'),
          )
          if (graded) return graded.id
        } else {
          const ungraded = categories.find(
            (c: any) => !c.name?.toLowerCase().includes('graded'),
          )
          if (ungraded) return ungraded.id
        }
      }
      return categories[0].id
    }
  } catch (err) {
    console.warn('[ebayTemplateResolver] getEbayCategoryIdDB query failed, using hardcoded fallback:', err)
  }

  // Fallback to hardcoded lookup
  return getEbayCategoryId(category as any, isGraded)
}

/**
 * Resolve the best listing template for an item.
 * Priority: Category Mappings > Graded Status + Category Match (DB lookup) > Default Template
 */
export async function resolveTemplate(
  supabase: ReturnType<typeof createClient>,
  item: any,
  storeKey: string,
): Promise<any | null> {
  const detectedCategory = (await detectCategoryFromBrandDB(supabase, item.brand_title)) || item.main_category
  const isGraded = !!item.grade

  // 1. Check category mappings for a linked template
  const { data: mappings } = await supabase
    .from('ebay_category_mappings')
    .select('default_template_id, brand_match, keyword_pattern, main_category')
    .eq('store_key', storeKey)
    .eq('is_active', true)
    .not('default_template_id', 'is', null)
    .order('priority', { ascending: false })

  let mappedTemplateId: string | null = null
  if (mappings) {
    for (const mapping of mappings) {
      if (mapping.brand_match?.length && item.brand_title) {
        const brandLower = item.brand_title.toLowerCase()
        if (mapping.brand_match.some((b: string) => brandLower.includes(b.toLowerCase()))) {
          mappedTemplateId = mapping.default_template_id
          break
        }
      }
      if (mapping.main_category && detectedCategory && mapping.main_category === detectedCategory) {
        mappedTemplateId = mapping.default_template_id
        break
      }
      if (mapping.keyword_pattern && (item.brand_title || item.subject)) {
        try {
          const re = new RegExp(mapping.keyword_pattern, 'i')
          if (re.test(item.brand_title || '') || re.test(item.subject || '')) {
            mappedTemplateId = mapping.default_template_id
            break
          }
        } catch {}
      }
    }
  }

  if (mappedTemplateId) {
    const { data: mappedTemplate } = await supabase
      .from('ebay_listing_templates')
      .select('*')
      .eq('id', mappedTemplateId)
      .eq('is_active', true)
      .single()
    if (mappedTemplate) return mappedTemplate
  }

  // 2. Fallback: find template by graded status + category (dynamic DB lookup)
  const { data: templates } = await supabase
    .from('ebay_listing_templates')
    .select('*')
    .eq('store_key', storeKey)
    .eq('is_graded', isGraded)
    .eq('is_active', true)
    .order('is_default', { ascending: false })

  if (templates && templates.length > 0) {
    // Dynamic category matching via ebay_categories table (replaces hardcoded IDs)
    if (detectedCategory) {
      const { data: categoryEntries } = await supabase
        .from('ebay_categories')
        .select('id')
        .eq('item_type', detectedCategory)
        .eq('is_active', true)

      if (categoryEntries && categoryEntries.length > 0) {
        const categoryIdSet = new Set(categoryEntries.map((c: any) => c.id))
        const matchedTemplate = templates.find((t: any) => categoryIdSet.has(t.category_id))
        if (matchedTemplate) return matchedTemplate
      }
    }

    // Last resort: first template (is_default sorted first)
    return templates[0]
  }

  return null
}

/**
 * Build aspects based on detected item category.
 * Selects the appropriate builder: TCG, Sports, or Comics.
 * Async: uses DB lookup for brand detection when no category is passed.
 */
export async function buildCategoryAwareAspects(
  supabase: ReturnType<typeof createClient>,
  item: any,
  detectedCategory?: string | null
): Promise<Record<string, string[]>> {
  const category = detectedCategory || (await detectCategoryFromBrandDB(supabase, item.brand_title)) || item.main_category

  switch (category) {
    case 'sports':
      return buildSportsCardAspects(item)
    case 'comics':
      return buildComicAspects(item)
    case 'tcg':
    default:
      return buildTradingCardAspects(item)
  }
}

/**
 * Build listing title from item data and optional template.
 */
export function buildTitle(item: any, template?: string | null): string {
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
      .trim()
  }

  const parts: string[] = []
  if (item.year) parts.push(item.year)
  if (item.brand_title) parts.push(item.brand_title)
  if (item.subject) parts.push(item.subject)
  if (item.card_number) parts.push(`#${item.card_number}`)
  if (item.grade && item.grading_company) {
    parts.push(`${item.grading_company} ${item.grade}`)
  } else if (item.grade) {
    parts.push(`PSA ${item.grade}`)
  }

  return parts.join(' ') || 'Trading Card'
}

/**
 * Build listing description from item data and optional template.
 */
export function buildDescription(item: any, template?: string | null): string {
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
      .trim()
  }

  const lines: string[] = [`<h2>${item.subject || 'Trading Card'}</h2>`]
  if (item.brand_title) lines.push(`<p><strong>Brand:</strong> ${item.brand_title}</p>`)
  if (item.year) lines.push(`<p><strong>Year:</strong> ${item.year}</p>`)
  if (item.card_number) lines.push(`<p><strong>Card #:</strong> ${item.card_number}</p>`)
  if (item.variant) lines.push(`<p><strong>Variant:</strong> ${item.variant}</p>`)
  if (item.grade) {
    const grader = item.grading_company || 'PSA'
    lines.push(`<p><strong>Grade:</strong> ${grader} ${item.grade}</p>`)
  }
  if (item.psa_cert) lines.push(`<p><strong>PSA Cert:</strong> ${item.psa_cert}</p>`)
  if (item.cgc_cert) lines.push(`<p><strong>CGC Cert:</strong> ${item.cgc_cert}</p>`)

  return lines.join('\n')
}
