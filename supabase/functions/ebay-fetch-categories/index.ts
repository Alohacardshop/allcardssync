import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidAccessToken } from '../_shared/ebayApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { store_key, parent_category_id, query } = await req.json()

    if (!store_key) {
      return new Response(JSON.stringify({ error: 'store_key is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get store config for environment
    const { data: storeConfig } = await supabase
      .from('ebay_store_config')
      .select('environment')
      .eq('store_key', store_key)
      .single()

    const environment = storeConfig?.environment || 'production'

    // Get access token
    const accessToken = await getValidAccessToken(supabase, store_key, environment as 'sandbox' | 'production')

    const baseUrl = environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

    let categories: any[] = []

    if (query) {
      // Search for categories by keyword using the Taxonomy API
      const searchUrl = `${baseUrl}/commerce/taxonomy/v1/category_tree/0/get_categories_by_keywords?keywords=${encodeURIComponent(query)}`
      
      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('eBay category search error:', response.status, errorText)
        
        // If taxonomy search fails, try using the category_tree endpoint
        if (response.status === 404 || response.status === 400) {
          return new Response(JSON.stringify({ 
            categories: [],
            message: 'No categories found for that search term'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        
        throw new Error(`eBay API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      // Parse the category suggestions
      if (data.categorySuggestions) {
        categories = data.categorySuggestions.map((suggestion: any) => ({
          id: suggestion.category?.categoryId,
          name: suggestion.category?.categoryName,
          parent_id: suggestion.categoryTreeNodeAncestors?.[0]?.categoryId || null,
          parent_name: suggestion.categoryTreeNodeAncestors?.[0]?.categoryName || null,
          full_path: [
            ...(suggestion.categoryTreeNodeAncestors || []).reverse().map((a: any) => a.categoryName),
            suggestion.category?.categoryName
          ].join(' > '),
          leaf: suggestion.categoryTreeNodeLevel !== undefined,
        }))
      }
    } else if (parent_category_id) {
      // Get child categories of a specific parent
      const treeUrl = `${baseUrl}/commerce/taxonomy/v1/category_tree/0/get_category_subtree?category_id=${parent_category_id}`
      
      const response = await fetch(treeUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`eBay API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      // Extract child categories
      if (data.categorySubtreeNode?.childCategoryTreeNodes) {
        categories = data.categorySubtreeNode.childCategoryTreeNodes.map((node: any) => ({
          id: node.category?.categoryId,
          name: node.category?.categoryName,
          parent_id: parent_category_id,
          full_path: node.category?.categoryName,
          leaf: node.leafCategoryTreeNode === true,
          has_children: !!node.childCategoryTreeNodes?.length,
        }))
      }
    } else {
      // Get top-level category tree (marketplace 0 = US)
      const treeUrl = `${baseUrl}/commerce/taxonomy/v1/category_tree/0`
      
      const response = await fetch(treeUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`eBay API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      // Return top-level categories
      if (data.rootCategoryNode?.childCategoryTreeNodes) {
        categories = data.rootCategoryNode.childCategoryTreeNodes.map((node: any) => ({
          id: node.category?.categoryId,
          name: node.category?.categoryName,
          parent_id: null,
          full_path: node.category?.categoryName,
          leaf: false,
          has_children: !!node.childCategoryTreeNodes?.length,
        }))
      }
    }

    return new Response(JSON.stringify({ categories }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Error fetching eBay categories:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
