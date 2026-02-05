 // Shopify Inventory Fetch Helpers
 // Paginated GraphQL for fallback and targeted queries
 
 import { fetchWithRetry } from './http.ts';
 import type { InventoryLevelData } from './shopify-bulk-operations.ts';
 
 const INVENTORY_LEVELS_QUERY = `
   query getInventoryLevels($first: Int!, $after: String) {
     inventoryItems(first: $first, after: $after) {
       edges {
         node {
           id
           sku
           inventoryLevels(first: 50) {
             edges {
               node {
                 id
                 quantities(names: ["available"]) {
                   name
                   quantity
                 }
                 updatedAt
                 location {
                   id
                   name
                 }
               }
             }
           }
         }
       }
       pageInfo {
         hasNextPage
         endCursor
       }
     }
   }
 `;
 
 export interface FetchOptions {
   apiVersion?: string;
   maxItems?: number;
   rateDelayMs?: number;
   onProgress?: (fetched: number) => void;
 }
 
 /**
  * Paginated fetch of all inventory levels (fallback for bulk operation failure)
  * Rate-limited to prevent throttling
  */
 export async function fetchInventoryLevelsPaginated(
   domain: string,
   accessToken: string,
   options: FetchOptions = {}
 ): Promise<InventoryLevelData[]> {
   const {
     apiVersion = '2024-07',
     maxItems,
     rateDelayMs = 250,
     onProgress
   } = options;
   
   const levels: InventoryLevelData[] = [];
   let hasNextPage = true;
   let cursor: string | null = null;
   let pageCount = 0;
 
   while (hasNextPage) {
     const response = await fetchWithRetry(
       `https://${domain}/admin/api/${apiVersion}/graphql.json`,
       {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'X-Shopify-Access-Token': accessToken,
         },
         body: JSON.stringify({
           query: INVENTORY_LEVELS_QUERY,
           variables: { first: 50, after: cursor },
         }),
       },
       { retries: 3, baseDelayMs: 1000 }
     );
 
     if (!response.ok) {
       // Check for rate limiting
       if (response.status === 429) {
         const retryAfter = parseInt(response.headers.get('Retry-After') || '2');
         console.log(`[FETCH] Rate limited, waiting ${retryAfter}s`);
         await new Promise(r => setTimeout(r, retryAfter * 1000));
         continue; // Retry same page
       }
       throw new Error(`Shopify API error: ${response.status}`);
     }
 
     const data = await response.json();
     
     // Check for throttling via GraphQL extensions
     const cost = data.extensions?.cost;
     if (cost && cost.throttleStatus?.currentlyAvailable < 100) {
       const restoreRate = cost.throttleStatus?.restoreRate || 50;
       const waitMs = Math.ceil((100 / restoreRate) * 1000);
       console.log(`[FETCH] Low query budget, waiting ${waitMs}ms`);
       await new Promise(r => setTimeout(r, waitMs));
     }
     
     if (data.errors) {
       console.error('[FETCH] GraphQL errors:', data.errors);
       throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
     }
 
     const inventoryItems = data.data?.inventoryItems;
     if (!inventoryItems) break;
 
     for (const edge of inventoryItems.edges) {
       const item = edge.node;
       
       for (const levelEdge of item.inventoryLevels.edges) {
         const level = levelEdge.node;
         const availableQty = level.quantities?.find((q: any) => q.name === 'available')?.quantity ?? 0;
         
         levels.push({
           inventory_item_id: item.id.replace('gid://shopify/InventoryItem/', ''),
           location_gid: level.location.id,
           location_name: level.location.name,
           available: availableQty,
           shopify_updated_at: level.updatedAt,
           sku: item.sku || null,
         });
       }
     }
 
     hasNextPage = inventoryItems.pageInfo.hasNextPage;
     cursor = inventoryItems.pageInfo.endCursor;
     pageCount++;
     
     onProgress?.(levels.length);
 
     if (maxItems && levels.length >= maxItems) {
       console.log(`[FETCH] Reached max items: ${maxItems}`);
       break;
     }
 
     // Rate limiting between pages
     await new Promise(r => setTimeout(r, rateDelayMs));
   }
 
   console.log(`[FETCH] Completed ${pageCount} pages, ${levels.length} levels`);
   return levels;
 }
 
 /**
  * Fetch specific inventory items by ID (for drift-only and missing-only modes)
  */
 export async function fetchSpecificInventoryLevels(
   domain: string,
   accessToken: string,
   inventoryItemIds: string[],
   options: FetchOptions = {}
 ): Promise<InventoryLevelData[]> {
   const { apiVersion = '2024-07', rateDelayMs = 300 } = options;
   const levels: InventoryLevelData[] = [];
   
   if (inventoryItemIds.length === 0) return levels;
   
   // Process in batches of 50 (GraphQL nodes limit)
   const BATCH_SIZE = 50;
   
   for (let i = 0; i < inventoryItemIds.length; i += BATCH_SIZE) {
     const batch = inventoryItemIds.slice(i, i + BATCH_SIZE);
     const gids = batch.map(id => 
       id.startsWith('gid://') ? id : `gid://shopify/InventoryItem/${id}`
     );
     
     const query = `
       query getSpecificInventoryLevels($ids: [ID!]!) {
         nodes(ids: $ids) {
           ... on InventoryItem {
             id
             sku
             inventoryLevels(first: 50) {
               edges {
                 node {
                   id
                   quantities(names: ["available"]) {
                     name
                     quantity
                   }
                   updatedAt
                   location {
                     id
                     name
                   }
                 }
               }
             }
           }
         }
       }
     `;
 
     const response = await fetchWithRetry(
       `https://${domain}/admin/api/${apiVersion}/graphql.json`,
       {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'X-Shopify-Access-Token': accessToken,
         },
         body: JSON.stringify({ query, variables: { ids: gids } }),
       },
       { retries: 3 }
     );
     
     if (response.status === 429) {
       const retryAfter = parseInt(response.headers.get('Retry-After') || '2');
       console.log(`[FETCH] Rate limited, waiting ${retryAfter}s`);
       await new Promise(r => setTimeout(r, retryAfter * 1000));
       i -= BATCH_SIZE; // Retry same batch
       continue;
     }
 
     const data = await response.json();
     
     if (data.errors) {
       console.error('[FETCH] GraphQL errors:', data.errors);
       continue; // Skip batch on error
     }
 
     for (const node of data.data?.nodes || []) {
       if (!node || !node.id) continue;
       
       for (const levelEdge of node.inventoryLevels?.edges || []) {
         const level = levelEdge.node;
         const availableQty = level.quantities?.find((q: any) => q.name === 'available')?.quantity ?? 0;
         
         levels.push({
           inventory_item_id: node.id.replace('gid://shopify/InventoryItem/', ''),
           location_gid: level.location.id,
           location_name: level.location.name,
           available: availableQty,
           shopify_updated_at: level.updatedAt,
           sku: node.sku || null,
         });
       }
     }
 
     // Rate limiting between batches
     await new Promise(r => setTimeout(r, rateDelayMs));
   }
 
   console.log(`[FETCH] Targeted fetch: ${levels.length} levels from ${inventoryItemIds.length} items`);
   return levels;
 }