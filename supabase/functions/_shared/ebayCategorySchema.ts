/**
 * eBay Category Schema Utility
 * 
 * Provides a unified, DB-cached interface for fetching and validating
 * eBay condition policies and aspect definitions for any category.
 * 
 * Cache hierarchy: in-memory (per invocation) → DB (ebay_category_schema_cache) → eBay API
 */

import { ebayApiRequest } from './ebayApi.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// ─── In-memory cache (per edge function invocation) ──────────────

const memCache = new Map<string, { data: EbayCategorySchema; ts: number }>()
const MEM_TTL_MS = 10 * 60 * 1000 // 10 min (within a single invocation)

// DB cache TTL
const DB_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function cacheKey(env: string, marketplace: string, category: string): string {
  return `${env}:${marketplace}:${category}`
}

// ─── DB Cache Read/Write ─────────────────────────────────────────

function getSupabaseAdmin(): ReturnType<typeof createClient> {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function readDbCache(
  supabase: ReturnType<typeof createClient>,
  environment: string,
  marketplaceId: string,
  categoryId: string,
): Promise<EbayCategorySchema | null> {
  const { data, error } = await supabase
    .from('ebay_category_schema_cache')
    .select('conditions, aspects, fetched_at')
    .eq('environment', environment)
    .eq('marketplace_id', marketplaceId)
    .eq('category_id', categoryId)
    .maybeSingle()

  if (error || !data) return null

  // Check TTL
  const fetchedAt = new Date(data.fetched_at).getTime()
  if (Date.now() - fetchedAt > DB_TTL_MS) {
    console.log(`[CategorySchema] DB cache stale for ${marketplaceId}:${categoryId}`)
    return null
  }

  const conditions = (data.conditions || []) as EbayConditionInfo[]
  const aspects = (data.aspects || []) as EbayAspectConstraint[]

  return buildSchemaObject(categoryId, marketplaceId, data.fetched_at, conditions, aspects)
}

async function writeDbCache(
  supabase: ReturnType<typeof createClient>,
  environment: string,
  marketplaceId: string,
  categoryId: string,
  conditions: EbayConditionInfo[],
  aspects: EbayAspectConstraint[],
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('ebay_category_schema_cache')
    .upsert(
      {
        environment,
        marketplace_id: marketplaceId,
        category_id: categoryId,
        conditions,
        aspects,
        fetched_at: now,
        updated_at: now,
      },
      { onConflict: 'environment,marketplace_id,category_id' },
    )

  if (error) {
    console.warn(`[CategorySchema] Failed to write DB cache: ${error.message}`)
  } else {
    console.log(`[CategorySchema] DB cache written for ${environment}:${marketplaceId}:${categoryId}`)
  }
}

// ─── Build helper ────────────────────────────────────────────────

function buildSchemaObject(
  categoryId: string,
  marketplaceId: string,
  fetchedAt: string,
  conditions: EbayConditionInfo[],
  aspects: EbayAspectConstraint[],
): EbayCategorySchema {
  return {
    categoryId,
    marketplaceId,
    fetchedAt,
    conditions,
    conditionIds: conditions.map(c => c.conditionId),
    aspects,
    requiredAspects: aspects.filter(a => a.required),
    optionalAspects: aspects.filter(a => !a.required),
    aspectNames: new Set(aspects.map(a => a.aspectName)),
  }
}

// ─── Fetch from eBay APIs ────────────────────────────────────────

async function fetchConditions(
  accessToken: string,
  environment: 'sandbox' | 'production',
  marketplaceId: string,
  categoryId: string,
): Promise<EbayConditionInfo[]> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'GET',
    `/sell/metadata/v1/marketplace/${marketplaceId}/get_item_condition_policies?filter=categoryIds:{${categoryId}}`,
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.warn(`[CategorySchema] Condition policies fetch failed for ${categoryId}: ${response.status} - ${errorText}`)
    return []
  }

  const text = await response.text()
  if (!text || !text.trim()) {
    console.warn(`[CategorySchema] Empty response body for conditions ${categoryId}`)
    return []
  }

  let data: any
  try {
    data = JSON.parse(text)
  } catch (e) {
    console.warn(`[CategorySchema] Malformed JSON for conditions ${categoryId}: ${e}`)
    return []
  }
  const condMap = new Map<string, EbayConditionInfo>()

  for (const policy of data.itemConditionPolicies || []) {
    for (const cond of policy.itemConditions || []) {
      if (cond.conditionId) {
        const id = String(cond.conditionId)
        if (!condMap.has(id)) {
          condMap.set(id, {
            conditionId: id,
            conditionDescription: cond.conditionDescription || id,
          })
        }
      }
    }
  }

  return [...condMap.values()]
}

async function fetchAspects(
  accessToken: string,
  environment: 'sandbox' | 'production',
  categoryId: string,
  categoryTreeId: string,
): Promise<EbayAspectConstraint[]> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'GET',
    `/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`,
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.warn(`[CategorySchema] Aspects fetch failed for ${categoryId}: ${response.status} - ${errorText}`)
    return []
  }

  const text = await response.text()
  if (!text || !text.trim()) {
    console.warn(`[CategorySchema] Empty response body for aspects ${categoryId}`)
    return []
  }

  let data: any
  try {
    data = JSON.parse(text)
  } catch (e) {
    console.warn(`[CategorySchema] Malformed JSON for aspects ${categoryId}: ${e}`)
    return []
  }
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
 * 
 * Cache hierarchy:
 * 1. In-memory (10min, per invocation)
 * 2. DB table ebay_category_schema_cache (24h TTL)
 * 3. Live eBay API call (writes back to DB)
 * 
 * Pass an optional supabase client; if omitted, creates one from env vars.
 */
export async function getCategorySchema(
  accessToken: string,
  environment: 'sandbox' | 'production',
  marketplaceId: string,
  categoryId: string,
  supabaseClient?: ReturnType<typeof createClient>,
): Promise<EbayCategorySchema> {
  const key = cacheKey(environment, marketplaceId, categoryId)

  // 1. In-memory cache
  const mem = memCache.get(key)
  if (mem && Date.now() - mem.ts < MEM_TTL_MS) {
    console.log(`[CategorySchema] Memory cache hit for ${key}`)
    return mem.data
  }

  const supabase = supabaseClient || getSupabaseAdmin()

  // 2. DB cache
  const dbCached = await readDbCache(supabase, environment, marketplaceId, categoryId)
  if (dbCached) {
    console.log(`[CategorySchema] DB cache hit for ${key}`)
    memCache.set(key, { data: dbCached, ts: Date.now() })
    return dbCached
  }

  // 3. Live fetch from eBay
  console.log(`[CategorySchema] Fetching from eBay API: marketplace=${marketplaceId} category=${categoryId}`)
  const treeId = getCategoryTreeId(marketplaceId)

  const [conditions, aspects] = await Promise.all([
    fetchConditions(accessToken, environment, marketplaceId, categoryId),
    fetchAspects(accessToken, environment, categoryId, treeId),
  ])

  const now = new Date().toISOString()
  const schema = buildSchemaObject(categoryId, marketplaceId, now, conditions, aspects)

  // Write to DB cache (fire-and-forget)
  writeDbCache(supabase, environment, marketplaceId, categoryId, conditions, aspects).catch(() => {})

  // Write to memory cache
  memCache.set(key, { data: schema, ts: Date.now() })
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
  isGraded: boolean,
): string {
  if (schema.conditionIds.length === 0) {
    const first = preferredConditionIds[0] || (isGraded ? '2750' : '4000')
    console.warn(`[CategorySchema] No condition data, using first preferred: ${first}`)
    return first
  }

  for (const id of preferredConditionIds) {
    if (schema.conditionIds.includes(id)) {
      console.log(`[CategorySchema] Matched preferred condition: ${id}`)
      return id
    }
  }

  console.warn(`[CategorySchema] None of [${preferredConditionIds.join(', ')}] valid. Valid: [${schema.conditionIds.join(', ')}]`)

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
  aspects: Record<string, string[]>,
): { validated: Record<string, string[]>; warnings: string[] } {
  if (schema.aspects.length === 0) {
    return { validated: aspects, warnings: ['No taxonomy data; aspects passed through unvalidated'] }
  }

  const validated: Record<string, string[]> = {}
  const warnings: string[] = []
  const removed: string[] = []

  const aspectMap = new Map<string, EbayAspectConstraint>()
  for (const a of schema.aspects) {
    aspectMap.set(a.aspectName, a)
  }

  for (const [key, values] of Object.entries(aspects)) {
    const def = aspectMap.get(key)
    if (!def) {
      removed.push(key)
      continue
    }

    let finalValues = values

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

    if (finalValues.length > def.maxValues) {
      finalValues = finalValues.slice(0, def.maxValues)
    }

    validated[key] = finalValues
  }

  if (removed.length > 0) {
    warnings.push(`Removed unsupported aspects: [${removed.join(', ')}]`)
  }

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
