 // Shopify Bulk Operations Helper
 // Handles async bulk exports for large inventory data
 
 import { fetchWithRetry } from './http.ts';
 
 const BULK_MUTATION = `
   mutation {
     bulkOperationRunQuery(
       query: """
         {
           inventoryItems {
             edges {
               node {
                 id
                 sku
                 inventoryLevels {
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
         }
       """
     ) {
       bulkOperation {
         id
         status
       }
       userErrors {
         field
         message
       }
     }
   }
 `;
 
 const BULK_STATUS_QUERY = `
   query {
     currentBulkOperation {
       id
       status
       errorCode
       objectCount
       fileSize
       url
       partialDataUrl
     }
   }
 `;
 
 export interface BulkOperationResult {
   url: string;
   objectCount: number;
   partialDataUrl?: string;
 }
 
 export async function startBulkOperation(
   domain: string, 
   accessToken: string,
   apiVersion = '2024-07'
 ): Promise<{ id: string } | null> {
   const response = await fetchWithRetry(
     `https://${domain}/admin/api/${apiVersion}/graphql.json`,
     {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'X-Shopify-Access-Token': accessToken,
       },
       body: JSON.stringify({ query: BULK_MUTATION }),
     },
     { retries: 3 }
   );
 
   const data = await response.json();
   
   if (data.errors || data.data?.bulkOperationRunQuery?.userErrors?.length > 0) {
     const errors = data.errors || data.data?.bulkOperationRunQuery?.userErrors;
     console.error('[BULK] Start error:', errors);
     return null;
   }
 
   return data.data?.bulkOperationRunQuery?.bulkOperation;
 }
 
 export async function pollBulkOperation(
   domain: string, 
   accessToken: string, 
   options: {
     maxWaitMs?: number;
     pollIntervalMs?: number;
     apiVersion?: string;
     onProgress?: (status: string, objectCount: number) => void;
   } = {}
 ): Promise<BulkOperationResult | null> {
   const { 
     maxWaitMs = 300000,
     pollIntervalMs = 3000,
     apiVersion = '2024-07',
     onProgress
   } = options;
   
   const startTime = Date.now();
   
   while (Date.now() - startTime < maxWaitMs) {
     await new Promise(r => setTimeout(r, pollIntervalMs));
     
     const response = await fetchWithRetry(
       `https://${domain}/admin/api/${apiVersion}/graphql.json`,
       {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'X-Shopify-Access-Token': accessToken,
         },
         body: JSON.stringify({ query: BULK_STATUS_QUERY }),
       }
     );
 
     const data = await response.json();
     const op = data.data?.currentBulkOperation;
     
     if (!op) {
       console.log('[BULK] No current operation found');
       return null;
     }
 
     const objectCount = op.objectCount || 0;
     console.log(`[BULK] Status: ${op.status}, objects: ${objectCount}`);
     onProgress?.(op.status, objectCount);
 
     if (op.status === 'COMPLETED') {
       return { 
         url: op.url, 
         objectCount,
         partialDataUrl: op.partialDataUrl 
       };
     }
     
     if (op.status === 'FAILED' || op.status === 'CANCELED') {
       console.error('[BULK] Failed:', op.errorCode);
       return null;
     }
   }
 
   console.error('[BULK] Timed out after', maxWaitMs, 'ms');
   return null;
 }
 
 export interface InventoryLevelData {
   inventory_item_id: string;
   location_gid: string;
   location_name: string;
   available: number;
   shopify_updated_at: string;
   sku: string | null;
 }
 
 export async function parseBulkResults(url: string): Promise<InventoryLevelData[]> {
   const levels: InventoryLevelData[] = [];
   
   const response = await fetch(url);
   if (!response.ok) {
     throw new Error(`Failed to fetch bulk results: ${response.status}`);
   }
 
   const text = await response.text();
   const lines = text.trim().split('\n');
 
   // JSONL format parsing
   const inventoryItems = new Map<string, { sku: string | null }>();
   const rawLevels: Array<{
     id: string;
     quantities: Array<{ name: string; quantity: number }>;
     updatedAt: string;
     location: { id: string; name: string };
     __parentId: string;
   }> = [];
 
   for (const line of lines) {
     if (!line.trim()) continue;
     
     try {
       const obj = JSON.parse(line);
       
       if (obj.id?.includes('InventoryItem') && !obj.__parentId) {
         inventoryItems.set(obj.id, { sku: obj.sku || null });
       }
       
       if (obj.id?.includes('InventoryLevel') && obj.__parentId) {
         rawLevels.push(obj);
       }
     } catch (e) {
       console.warn('[BULK] Parse error:', e);
     }
   }
 
   for (const level of rawLevels) {
     const parentItem = inventoryItems.get(level.__parentId);
     const availableQty = level.quantities?.find(q => q.name === 'available')?.quantity ?? 0;
     
     levels.push({
       inventory_item_id: level.__parentId.replace('gid://shopify/InventoryItem/', ''),
       location_gid: level.location.id,
       location_name: level.location.name,
       available: availableQty,
       shopify_updated_at: level.updatedAt,
       sku: parentItem?.sku || null,
     });
   }
 
   console.log(`[BULK] Parsed ${levels.length} inventory levels from ${inventoryItems.size} items`);
   return levels;
 }