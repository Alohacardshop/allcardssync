/**
 * eBay Category Schema Utility
 * 
 * Provides a unified, cached interface for fetching and validating
 * eBay condition policies and aspect definitions for any category.
 */

import { ebayApiRequest } from './ebayApi.ts'

// ─── Types ───────────────────────────────────────────────────────

export interface EbayConditionInfo {
  conditionId: string
  conditionDescription: string
}

export interface EbayAspectConstraint {
  aspectName: string
  required: boolean
  mode: 'FREE_TEXT' | 'SELECTION_ONLY' | string
  dataType: string
  allowedValues: string[]   // empty if free-text
  maxValues: number
}

export interface EbayCategorySchema {
  categoryId: string
  marketplaceId: string
  fetchedAt: string
  conditions: EbayConditionInfo[]
  conditionIds: string[]
  aspects: EbayAspectConstraint[]
  requiredAspects: EbayAspectConstraint[]
  optionalAspects: EbayAspectConstraint[]
  aspectNames: Set<string>
}

// ─── Marketplace → Category Tree mapping ─────────────────────────

const MARKETPLACE_TREE_MAP: Record<string, string> = {
  EBAY_US: '0',
  EBAY_GB: '3',
  EBAY_AU: '15',
  EBAY_DE: '77',
  EBAY_CA: '2',
  EBAY_FR: '71',
  EBAY_IT: '101',
  EBAY_ES: '186',
}

function getCategoryTreeId(marketplaceId: string): string {
  return MARKETPLACE_TREE_MAP[marketplaceId] || '0'
}

// ─── Cache ───────────────────────────────────────────────────────

const schemaCache = new Map<string, { data: EbayCategorySchema; ts: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function cacheKey(marketplaceId: string, categoryId: string, environment: string): string {
  return `${environment}:${marketplaceId}:${categoryId}`
}

// ─── Fetch + Parse ───────────────────────────────────────────────

async function fetchConditions(
  accessToken: string,
  environment: 'sandbox' | 'production',
  marketplaceId: string,
  categoryId: string
): Promise<EbayConditionInfo[]> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'GET',
    `/sell/metadata/v1/marketplace/${marketplaceId}/get_item_condition_policies?filter=categoryIds:{${categoryId}}`
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.warn(`[CategorySchema] Condition policies fetch failed for ${categoryId}: ${response.status} - ${errorText}`)
    return []
  }

  const data = await response.json()
  const conditions: EbayConditionInfo[] = []

  for (const policy of data.itemConditionPolicies || []) {
    for (const cond of policy.itemConditions || []) {
      if (cond.conditionId) {
        conditions.push({
          conditionId: String(cond.conditionId),
          conditionDescription: cond.conditionDescription || cond.conditionId,
        })
      }
    }
  }

  return conditions
}

async function fetchAspects(
  accessToken: string,
  environment: 'sandbox' | 'production',
  categoryId: string,
  categoryTreeId: string
): Promise<EbayAspectConstraint[]> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'GET',
    `/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.warn(`[CategorySchema] Aspects fetch failed for ${categoryId}: ${response.status} - ${errorText}`)
    return []
  }

  const data = await response.json()
  const aspects: EbayAspectConstraint[] = []

  for (const aspect of data.aspects || []) {
    const name = aspect.localizedAspectName
    if (!name) continue

    const constraint = aspect.aspectConstraint || {}
    const values = aspect.aspectValues || []

    aspects.push({
      aspectName: name,
      required: constraint.aspectRequired === true,
      mode: constraint.aspectMode || 'FREE_TEXT',
      dataType: constraint.aspectDataType || 'STRING',
      allowedValues: values.map((v: any) => v.localizedValue).filter(Boolean),
      maxValues: constraint.itemToAspectCardinality === 'MULTI' ? 30 : 1,
    })
  }

  return aspects
}

// ─── Main Entry Point ────────────────────────────────────────────

/**
 * Get the full category schema (conditions + aspects) for an eBay category.
 * Results are cached for 24 hours per environment:marketplace:category.
 */
export async function getCategorySchema(
  accessToken: string,
  environment: 'sandbox' | 'production',
  marketplaceId: string,
  categoryId: string
): Promise<EbayCategorySchema> {
  const key = cacheKey(marketplaceId, categoryId, environment)
  const cached = schemaCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[CategorySchema] Cache hit for ${key}`)
    return cached.data
  }

  console.log(`[CategorySchema] Fetching schema for marketplace=${marketplaceId} category=${categoryId}`)

  const treeId = getCategoryTreeId(marketplaceId)

  // Fetch conditions and aspects in parallel
  const [conditions, aspects] = await Promise.all([
    fetchConditions(accessToken, environment, marketplaceId, categoryId),
    fetchAspects(accessToken, environment, categoryId, treeId),
  ])

  const schema: EbayCategorySchema = {
    categoryId,
    marketplaceId,
    fetchedAt: new Date().toISOString(),
    conditions,
    conditionIds: conditions.map(c => c.conditionId),
    aspects,
    requiredAspects: aspects.filter(a => a.required),
    optionalAspects: aspects.filter(a => !a.required),
    aspectNames: new Set(aspects.map(a => a.aspectName)),
  }

  schemaCache.set(key, { data: schema, ts: Date.now() })
  console.log(`[CategorySchema] Cached: ${conditions.length} conditions, ${aspects.length} aspects (${schema.requiredAspects.length} required)`)

  return schema
}

// ─── Validation Helpers ──────────────────────────────────────────

/**
 * Validate a condition ID against the schema. Returns a valid condition ID.
 * Accepts a priority list of preferred IDs; returns the first valid match.
 */
export function resolveConditionId(
  schema: EbayCategorySchema,
  preferredConditionIds: string[],
  isGraded: boolean
): string {
  if (schema.conditionIds.length === 0) {
    const first = preferredConditionIds[0] || (isGraded ? '2750' : '4000')
    console.warn(`[CategorySchema] No condition data, using first preferred: ${first}`)
    return first
  }

  // Iterate the priority list and return the first valid match
  for (const id of preferredConditionIds) {
    if (schema.conditionIds.includes(id)) {
      console.log(`[CategorySchema] Matched preferred condition: ${id}`)
      return id
    }
  }

  console.warn(`[CategorySchema] None of [${preferredConditionIds.join(', ')}] valid. Valid: [${schema.conditionIds.join(', ')}]`)

  // Hardcoded fallbacks as last resort
  const fallbacks = isGraded ? ['2750', '3000', '4000'] : ['4000', '3000']
  for (const fb of fallbacks) {
    if (schema.conditionIds.includes(fb)) {
      console.log(`[CategorySchema] Fallback condition: ${fb}`)
      return fb
    }
  }

  const fallback = schema.conditionIds[0]
  console.log(`[CategorySchema] Last-resort condition: ${fallback}`)
  return fallback
}

/**
 * Filter aspects to only supported keys, enforce required aspects,
 * and trim values to allowed lists when mode is SELECTION_ONLY.
 */
export function validateAspects(
  schema: EbayCategorySchema,
  aspects: Record<string, string[]>
): { validated: Record<string, string[]>; warnings: string[] } {
  if (schema.aspects.length === 0) {
    return { validated: aspects, warnings: ['No taxonomy data; aspects passed through unvalidated'] }
  }

  const validated: Record<string, string[]> = {}
  const warnings: string[] = []
  const removed: string[] = []

  // Build lookup
  const aspectMap = new Map<string, EbayAspectConstraint>()
  for (const a of schema.aspects) {
    aspectMap.set(a.aspectName, a)
  }

  // Filter and validate provided aspects
  for (const [key, values] of Object.entries(aspects)) {
    const def = aspectMap.get(key)
    if (!def) {
      removed.push(key)
      continue
    }

    let finalValues = values

    // For SELECTION_ONLY, filter to allowed values
    if (def.mode === 'SELECTION_ONLY' && def.allowedValues.length > 0) {
      finalValues = values.filter(v => def.allowedValues.includes(v))
      if (finalValues.length === 0) {
        warnings.push(`Aspect "${key}": none of [${values.join(', ')}] are valid. Allowed: [${def.allowedValues.slice(0, 5).join(', ')}...]`)
        continue
      }
      if (finalValues.length < values.length) {
        warnings.push(`Aspect "${key}": some values filtered. Kept: [${finalValues.join(', ')}]`)
      }
    }

    // Trim to max values
    if (finalValues.length > def.maxValues) {
      finalValues = finalValues.slice(0, def.maxValues)
    }

    validated[key] = finalValues
  }

  if (removed.length > 0) {
    warnings.push(`Removed unsupported aspects: [${removed.join(', ')}]`)
  }

  // Warn about missing required aspects
  for (const req of schema.requiredAspects) {
    if (!validated[req.aspectName]) {
      warnings.push(`Missing required aspect: "${req.aspectName}"`)
    }
  }

  return { validated, warnings }
}

/**
 * Serialize schema for debug/display (converts Sets to arrays for JSON)
 */
export function serializeCategorySchema(schema: EbayCategorySchema): Record<string, unknown> {
  return {
    categoryId: schema.categoryId,
    marketplaceId: schema.marketplaceId,
    fetchedAt: schema.fetchedAt,
    conditions: schema.conditions,
    requiredAspects: schema.requiredAspects.map(a => ({
      name: a.aspectName,
      mode: a.mode,
      allowedValues: a.allowedValues.length > 20 
        ? [...a.allowedValues.slice(0, 20), `... and ${a.allowedValues.length - 20} more`]
        : a.allowedValues,
      maxValues: a.maxValues,
    })),
    optionalAspects: schema.optionalAspects.map(a => ({
      name: a.aspectName,
      mode: a.mode,
      allowedValues: a.allowedValues.length > 10
        ? [...a.allowedValues.slice(0, 10), `... and ${a.allowedValues.length - 10} more`]
        : a.allowedValues,
      maxValues: a.maxValues,
    })),
    summary: {
      totalConditions: schema.conditions.length,
      totalAspects: schema.aspects.length,
      requiredAspectCount: schema.requiredAspects.length,
      optionalAspectCount: schema.optionalAspects.length,
    },
  }
}
