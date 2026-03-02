import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken } from '../_shared/ebayApi.ts'
import { ebayApiRequest } from '../_shared/ebayApi.ts'
import { getCategorySchema, serializeCategorySchema } from '../_shared/ebayCategorySchema.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Marketplace → Category Tree mapping
const MARKETPLACE_TREE_MAP: Record<string, string> = {
  EBAY_US: '0', EBAY_GB: '3', EBAY_AU: '15', EBAY_DE: '77',
  EBAY_CA: '2', EBAY_FR: '71', EBAY_IT: '101', EBAY_ES: '186',
}

interface SubtreeCategory {
  categoryId: string
  categoryName: string
  isLeaf: boolean
  childCount: number
  parentId: string | null
}

function flattenSubtree(node: any, parentId: string | null = null): SubtreeCategory[] {
  const results: SubtreeCategory[] = []
  if (!node) return results

  const children = node.childCategoryTreeNodes || []
  results.push({
    categoryId: node.category?.categoryId || '',
    categoryName: node.category?.categoryName || '',
    isLeaf: children.length === 0,
    childCount: children.length,
    parentId,
  })

  for (const child of children) {
    results.push(...flattenSubtree(child, node.category?.categoryId))
  }
  return results
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Verify JWT and admin/staff role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    const userRoles = (roles || []).map((r: any) => r.role)
    if (!userRoles.includes('admin') && !userRoles.includes('staff')) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request
    const { category_id, store_key, marketplace_id, action } = await req.json().catch(() => ({}))

    if (!category_id) {
      return new Response(JSON.stringify({ error: 'category_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get store config to determine environment
    const resolvedStoreKey = store_key || 'default'
    const { data: storeConfig } = await supabase
      .from('ebay_store_config')
      .select('environment, marketplace_id, store_key')
      .eq('store_key', resolvedStoreKey)
      .single()

    if (!storeConfig) {
      return new Response(JSON.stringify({ error: `No eBay config for store: ${resolvedStoreKey}` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const environment = storeConfig.environment as 'sandbox' | 'production'
    const resolvedMarketplace = marketplace_id || storeConfig.marketplace_id || 'EBAY_US'
    const accessToken = await getValidAccessToken(supabase, storeConfig.store_key, environment)
    const treeId = MARKETPLACE_TREE_MAP[resolvedMarketplace] || '0'

    // ── Action: subtree ──
    if (action === 'subtree') {
      console.log(`[ebay-category-schema] Fetching subtree for category ${category_id} in tree ${treeId}`)
      const response = await ebayApiRequest(
        accessToken, environment, 'GET',
        `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_subtree?category_id=${category_id}`,
      )

      if (!response.ok) {
        const errorText = await response.text()
        let errorDetail = errorText
        try {
          const errJson = JSON.parse(errorText)
          const firstError = errJson.errors?.[0]
          if (firstError) {
            errorDetail = `${firstError.errorId}: ${firstError.message}`
          }
        } catch { /* use raw text */ }
        return new Response(JSON.stringify({
          success: false,
          error: `eBay API error: ${errorDetail}`,
          isInvalidCategory: errorText.includes('62005'),
        }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const text = await response.text()
      if (!text) {
        return new Response(JSON.stringify({ success: false, error: 'Empty response from eBay' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const data = JSON.parse(text)
      const categories = flattenSubtree(data.categorySubtreeNode)

      return new Response(JSON.stringify({
        success: true,
        treeId,
        marketplace: resolvedMarketplace,
        rootCategoryId: category_id,
        categories,
        totalCategories: categories.length,
        leafCategories: categories.filter(c => c.isLeaf).length,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Default action: schema ──
    const schema = await getCategorySchema(accessToken, environment, resolvedMarketplace, category_id)

    return new Response(
      JSON.stringify({
        success: true,
        schema: serializeCategorySchema(schema),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[ebay-category-schema] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
