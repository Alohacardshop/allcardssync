/**
 * Shared Shopify media ordering logic.
 * Ensures the front image is always the featured/primary image on Shopify.
 * 
 * Steps:
 * 1. Query existing media on the product (dedupe — skip re-upload if already present)
 * 2. Identify front vs back by filename matching against intended order
 * 3. Reorder via productReorderMedia GraphQL mutation
 * 4. Fix variant featuredMedia override (the #1 reason reorder "does nothing" visually)
 * 5. Re-query and assert correctness — log PASS or FAIL
 */

interface MediaOrderArgs {
  domain: string
  token: string
  productId: string                 // numeric Shopify product ID
  intendedFrontUrl: string          // the URL we consider "front" (index 0 of our sorted array)
  apiVersion?: string
}

interface MediaNode {
  id: string
  url: string
}

interface MediaOrderResult {
  success: boolean
  frontMediaId?: string
  message: string
}

const FULL_PRODUCT_MEDIA_QUERY = `
  query productMediaAudit($id: ID!) {
    product(id: $id) {
      id
      featuredMedia {
        id
        preview { image { url } }
      }
      media(first: 20) {
        nodes {
          id
          ... on MediaImage {
            image { url }
          }
          preview { image { url } }
        }
      }
      variants(first: 10) {
        nodes {
          id
          title
          media(first: 1) {
            nodes {
              id
              preview { image { url } }
            }
          }
        }
      }
    }
  }
`

async function graphql(domain: string, token: string, query: string, variables: Record<string, any>, apiVersion = '2024-07'): Promise<any> {
  const resp = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`GraphQL HTTP ${resp.status}: ${text}`)
  }
  return resp.json()
}

function extractFilename(url: string): string {
  // Extract filename before query params, e.g. "uooA2qS1wUGojEweOijfpw.jpg"
  const path = url.split('?')[0]
  return path.split('/').pop() || ''
}

function findMediaByFilename(nodes: MediaNode[], filename: string): MediaNode | undefined {
  if (!filename) return undefined
  return nodes.find(n => {
    const nFilename = extractFilename(n.url)
    return nFilename === filename || n.url.includes(filename)
  })
}

export async function ensureMediaOrder(args: MediaOrderArgs): Promise<MediaOrderResult> {
  const { domain, token, productId, intendedFrontUrl, apiVersion = '2024-07' } = args
  const productGid = `gid://shopify/Product/${productId}`
  const frontFilename = extractFilename(intendedFrontUrl)

  console.log(`[MEDIA ORDER] Starting for product ${productId}, front filename: ${frontFilename}`)

  // ── Step 1: Query current media state ──
  await new Promise(r => setTimeout(r, 3000)) // Wait for Shopify to finish processing uploads
  
  const auditResult = await graphql(domain, token, FULL_PRODUCT_MEDIA_QUERY, { id: productGid }, apiVersion)
  const productData = auditResult?.data?.product
  if (!productData) {
    return { success: false, message: `Product ${productId} not found via GraphQL` }
  }

  const mediaNodes: MediaNode[] = (productData.media?.nodes || []).map((n: any) => ({
    id: n.id,
    url: n.image?.url || n.preview?.image?.url || ''
  }))

  const featuredUrl = productData.featuredMedia?.preview?.image?.url || ''
  const featuredId = productData.featuredMedia?.id || ''
  const variants = productData.variants?.nodes || []

  // ── Step 1 logging: Truth check ──
  console.log(`[MEDIA ORDER] Current state:`)
  console.log(`  Media count: ${mediaNodes.length}`)
  mediaNodes.forEach((m, i) => console.log(`  [${i}] ${extractFilename(m.url)} → ${m.id}`))
  console.log(`  Featured media: ${extractFilename(featuredUrl)} (${featuredId})`)
  if (variants.length > 0) {
    const v0media = variants[0].media?.nodes?.[0]
    console.log(`  Variant[0] media: ${v0media ? extractFilename(v0media.preview?.image?.url || '') : 'none'} (${v0media?.id || 'none'})`)
  }

  if (mediaNodes.length < 2) {
    console.log(`[MEDIA ORDER] Only ${mediaNodes.length} media items, skipping reorder`)
    return { success: true, message: 'Single or no media, nothing to reorder' }
  }

  // ── Step 2: Identify front media node ──
  const frontMedia = findMediaByFilename(mediaNodes, frontFilename)
  if (!frontMedia) {
    console.warn(`[MEDIA ORDER] ⚠️ Could not match front filename "${frontFilename}" in Shopify media`)
    return { success: false, message: `Front image filename "${frontFilename}" not found in product media` }
  }

  const isAlreadyFirst = mediaNodes[0].id === frontMedia.id
  const isAlreadyFeatured = featuredId === frontMedia.id
  console.log(`[MEDIA ORDER] Front media: ${frontMedia.id}, already first: ${isAlreadyFirst}, already featured: ${isAlreadyFeatured}`)

  // ── Step 3: Reorder if needed ──
  if (!isAlreadyFirst) {
    const otherNodes = mediaNodes.filter(n => n.id !== frontMedia.id)
    const moves = [
      { id: frontMedia.id, newPosition: "0" },
      ...otherNodes.map((n, i) => ({ id: n.id, newPosition: String(i + 1) }))
    ]

    console.log(`[MEDIA ORDER] Reordering: moving ${frontMedia.id} to position 0`)
    const reorderResult = await graphql(domain, token, `
      mutation($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) {
          job { id }
          mediaUserErrors { field message }
        }
      }
    `, { id: productGid, moves }, apiVersion)

    const errs = reorderResult?.data?.productReorderMedia?.mediaUserErrors || []
    if (errs.length > 0) {
      console.warn(`[MEDIA ORDER] Reorder userErrors:`, JSON.stringify(errs))
      return { success: false, frontMediaId: frontMedia.id, message: `Reorder failed: ${JSON.stringify(errs)}` }
    }
    console.log(`[MEDIA ORDER] ✅ Reorder mutation accepted`)
  }

  // ── Step 4: Fix variant featuredMedia override ──
  // If the first variant has a different featured media, update it to point to front
  for (const variant of variants) {
    const variantMediaId = variant.media?.nodes?.[0]?.id
    if (variantMediaId && variantMediaId !== frontMedia.id) {
      console.log(`[MEDIA ORDER] Fixing variant ${variant.id} media: ${variantMediaId} → ${frontMedia.id}`)
      try {
        // Detach wrong media, attach correct one
        const detachResult = await graphql(domain, token, `
          mutation($productId: ID!, $variantMedia: [ProductVariantDetachMediaInput!]!) {
            productVariantDetachMedia(productId: $productId, variantMedia: $variantMedia) {
              userErrors { field message }
            }
          }
        `, {
          productId: productGid,
          variantMedia: [{ variantId: variant.id, mediaIds: [variantMediaId] }]
        }, apiVersion)
        const detachErrs = detachResult?.data?.productVariantDetachMedia?.userErrors || []
        if (detachErrs.length > 0) {
          console.warn(`[MEDIA ORDER] Variant detach errors:`, JSON.stringify(detachErrs))
        }

        const attachResult = await graphql(domain, token, `
          mutation($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
            productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
              userErrors { field message }
            }
          }
        `, {
          productId: productGid,
          variantMedia: [{ variantId: variant.id, mediaIds: [frontMedia.id] }]
        }, apiVersion)
        const attachErrs = attachResult?.data?.productVariantAppendMedia?.userErrors || []
        if (attachErrs.length > 0) {
          console.warn(`[MEDIA ORDER] Variant attach errors:`, JSON.stringify(attachErrs))
        } else {
          console.log(`[MEDIA ORDER] ✅ Variant ${variant.id} media updated to front image`)
        }
      } catch (variantErr) {
        console.warn(`[MEDIA ORDER] Variant media fix error:`, variantErr)
      }
    }
  }

  // ── Step 5: Assertion — re-query and verify ──
  await new Promise(r => setTimeout(r, 2000)) // Let Shopify process
  const verifyResult = await graphql(domain, token, FULL_PRODUCT_MEDIA_QUERY, { id: productGid }, apiVersion)
  const verifyProduct = verifyResult?.data?.product

  const verifyMedia: MediaNode[] = (verifyProduct?.media?.nodes || []).map((n: any) => ({
    id: n.id,
    url: n.image?.url || n.preview?.image?.url || ''
  }))
  const verifyFeaturedUrl = verifyProduct?.featuredMedia?.preview?.image?.url || ''
  const verifyFeaturedId = verifyProduct?.featuredMedia?.id || ''

  const firstMediaCorrect = verifyMedia.length > 0 && verifyMedia[0].id === frontMedia.id
  const featuredCorrect = verifyFeaturedId === frontMedia.id

  console.log(`[MEDIA ORDER] ── Verification ──`)
  console.log(`  First media: ${extractFilename(verifyMedia[0]?.url || '')} (${verifyMedia[0]?.id}) — ${firstMediaCorrect ? '✅ CORRECT' : '❌ WRONG'}`)
  console.log(`  Featured: ${extractFilename(verifyFeaturedUrl)} (${verifyFeaturedId}) — ${featuredCorrect ? '✅ CORRECT' : '❌ WRONG'}`)
  verifyMedia.forEach((m, i) => console.log(`  [${i}] ${extractFilename(m.url)}`))

  if (!firstMediaCorrect || !featuredCorrect) {
    const msg = `FAILED IMAGE ORDER for product ${productId}: first=${verifyMedia[0]?.id}, featured=${verifyFeaturedId}, expected=${frontMedia.id}`
    console.error(`[MEDIA ORDER] ❌ ${msg}`)
    return { success: false, frontMediaId: frontMedia.id, message: msg }
  }

  console.log(`[MEDIA ORDER] ✅ PASSED — Product ${productId} front image verified as featured`)
  return { success: true, frontMediaId: frontMedia.id, message: 'Image order verified successfully' }
}

/**
 * Determine the intended front image URL for an intake item.
 * Handles both PSA API items (with IsFrontImage flags) and scraped comics.
 */
export function determineFrontImageUrl(intakeItem: any): string {
  // 1. PSA snapshot with IsFrontImage flags (most reliable)
  if (intakeItem.psa_snapshot?.images && Array.isArray(intakeItem.psa_snapshot.images)) {
    const frontImg = intakeItem.psa_snapshot.images.find((img: any) => img.IsFrontImage === true)
    if (frontImg?.ImageURL) return frontImg.ImageURL
    // If no IsFrontImage flag, sort and take first
    const sorted = [...intakeItem.psa_snapshot.images]
      .sort((a: any, b: any) => (b.IsFrontImage ? 1 : 0) - (a.IsFrontImage ? 1 : 0))
    if (sorted[0]?.ImageURL) return sorted[0].ImageURL
  }

  // 2. Comics without psa_snapshot: first image is the front cover
  const isComic = intakeItem.main_category === 'comics' ||
                  intakeItem.catalog_snapshot?.type === 'graded_comic' ||
                  intakeItem.catalog_snapshot?.type === 'psa_comic'
  
  const imageUrls = intakeItem.image_urls || []
  if (isComic && imageUrls.length >= 1) {
    return imageUrls[0] // First image is the front for comics
  }

  // 3. Default: first image_url
  return imageUrls[0] || intakeItem.image_url || ''
}
