/**
 * Hook for managing E2E test workflow state
 * Handles test item generation, sync operations, and cleanup
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateTestItems, buildLabelDataFromTestItem, type TestIntakeItem } from '@/lib/testDataGenerator';
import { zplFromTemplateString } from '@/lib/labels/zpl';
import { useStore } from '@/contexts/StoreContext';

export type TestItemStatus = 'created' | 'shopify_syncing' | 'shopify_synced' | 'shopify_failed' | 
  'ebay_queued' | 'ebay_processing' | 'ebay_synced' | 'ebay_failed' | 'printed';

export interface TestItemWithStatus extends TestIntakeItem {
  status: TestItemStatus;
  shopify_product_id?: string;
  shopify_sync_error?: string;
  ebay_sync_status?: string;
  ebay_sync_error?: string;
  printed_at?: string;
}

export interface E2ETestState {
  testItems: TestItemWithStatus[];
  isGenerating: boolean;
  isShopifySyncing: boolean;
  isEbaySyncing: boolean;
  isPrinting: boolean;
  isCleaningUp: boolean;
  shopifyDryRun: boolean;
  ebayDryRunEnabled: boolean;
  printDryRun: boolean;
}

const INITIAL_STATE: E2ETestState = {
  testItems: [],
  isGenerating: false,
  isShopifySyncing: false,
  isEbaySyncing: false,
  isPrinting: false,
  isCleaningUp: false,
  shopifyDryRun: true,
  ebayDryRunEnabled: true,
  printDryRun: true
};

export function useE2ETest() {
  const [state, setState] = useState<E2ETestState>(INITIAL_STATE);
  const { assignedStore, selectedLocation } = useStore();

  // Generate and insert test items
  const generateItems = useCallback(async (count: number, options?: { gradedOnly?: boolean; rawOnly?: boolean }) => {
    // Validate store/location access
    if (!assignedStore || !selectedLocation) {
      toast.error('No store or location assigned. Please check your user assignments.');
      return;
    }
    
    setState(s => ({ ...s, isGenerating: true }));
    
    try {
      const items = generateTestItems(count, {
        storeKey: assignedStore,
        shopifyLocationGid: selectedLocation,
        gradedOnly: options?.gradedOnly,
        rawOnly: options?.rawOnly
      });
      
      // Insert using RPC (direct insert blocked by RLS)
      const insertedItemIds: string[] = [];
      
      for (const item of items) {
        const catalogSnapshot = {
          grading_company: item.grading_company,
          grade: item.grade,
          cert_number: item.psa_cert || item.cgc_cert,
          type: item.type
        };
        
        const { data: insertedItem, error } = await supabase.rpc('create_raw_intake_item', {
          sku_in: item.sku,
          store_key_in: item.store_key,
          shopify_location_gid_in: item.shopify_location_gid,
          brand_title_in: item.brand_title,
          subject_in: item.subject,
          variant_in: item.variant,
          card_number_in: item.card_number,
          year_in: item.year,
          category_in: item.category,
          main_category_in: item.main_category,
          sub_category_in: item.sub_category,
          price_in: item.price,
          cost_in: item.cost,
          quantity_in: item.quantity,
          grade_in: item.grade,
          catalog_snapshot_in: catalogSnapshot,
          processing_notes_in: item.processing_notes
        });
        
        if (error) {
          console.error('Failed to insert test item:', error);
          continue;
        }
        
        if (insertedItem && Array.isArray(insertedItem) && insertedItem.length > 0) {
          insertedItemIds.push(insertedItem[0].id);
        }
      }
      
      // Fetch full item data for inserted items
      let itemsWithStatus: TestItemWithStatus[] = [];
      if (insertedItemIds.length > 0) {
        const { data: fullItems } = await supabase
          .from('intake_items')
          .select('*')
          .in('id', insertedItemIds);
        
        itemsWithStatus = (fullItems || []).map(item => ({
          ...item,
          status: 'created' as TestItemStatus
        })) as TestItemWithStatus[];
      }
      
      setState(s => ({
        ...s,
        testItems: [...s.testItems, ...itemsWithStatus],
        isGenerating: false
      }));
      
      toast.success(`Generated ${insertedItemIds.length} test item(s)`);
    } catch (error) {
      console.error('Failed to generate test items:', error);
      toast.error('Failed to generate test items');
      setState(s => ({ ...s, isGenerating: false }));
    }
  }, [assignedStore, selectedLocation]);

  // Sync test items to Shopify
  const syncToShopify = useCallback(async (itemIds: string[]) => {
    setState(s => ({ ...s, isShopifySyncing: true }));
    
    try {
      // Update status to syncing
      setState(s => ({
        ...s,
        testItems: s.testItems.map(item => 
          itemIds.includes(item.id) ? { ...item, status: 'shopify_syncing' as TestItemStatus } : item
        )
      }));
      
      if (state.shopifyDryRun) {
        // Simulate sync in dry run mode
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        setState(s => ({
          ...s,
          testItems: s.testItems.map(item => 
            itemIds.includes(item.id) ? { 
              ...item, 
              status: 'shopify_synced' as TestItemStatus,
              shopify_product_id: `dry-run-${Date.now()}`
            } : item
          ),
          isShopifySyncing: false
        }));
        
        toast.success(`[DRY RUN] Simulated Shopify sync for ${itemIds.length} item(s)`);
        return;
      }
      
      // Real Shopify sync
      const { data, error } = await supabase.functions.invoke('shopify-sync', {
        body: { itemIds, storeKey: assignedStore || 'hawaii' }
      });
      
      if (error) throw error;
      
      // Update items with results
      const results = data?.results || [];
      setState(s => ({
        ...s,
        testItems: s.testItems.map(item => {
          if (!itemIds.includes(item.id)) return item;
          const result = results.find((r: any) => r.itemId === item.id);
          if (result?.success) {
            return { ...item, status: 'shopify_synced' as TestItemStatus, shopify_product_id: result.productId };
          } else {
            return { ...item, status: 'shopify_failed' as TestItemStatus, shopify_sync_error: result?.error };
          }
        }),
        isShopifySyncing: false
      }));
      
      toast.success(`Synced ${itemIds.length} item(s) to Shopify`);
    } catch (error) {
      console.error('Shopify sync failed:', error);
      setState(s => ({
        ...s,
        testItems: s.testItems.map(item => 
          itemIds.includes(item.id) ? { ...item, status: 'shopify_failed' as TestItemStatus, shopify_sync_error: String(error) } : item
        ),
        isShopifySyncing: false
      }));
      toast.error('Shopify sync failed');
    }
  }, [state.shopifyDryRun, assignedStore]);

  // Queue items for eBay sync
  const queueForEbay = useCallback(async (itemIds: string[]) => {
    try {
      // Insert into ebay_sync_queue
      const queueItems = itemIds.map(id => ({
        inventory_item_id: id,
        action: 'create' as const,
        status: 'queued',
        retry_count: 0,
        max_retries: 3
      }));
      
      const { error } = await supabase
        .from('ebay_sync_queue')
        .insert(queueItems);
      
      if (error) throw error;
      
      setState(s => ({
        ...s,
        testItems: s.testItems.map(item => 
          itemIds.includes(item.id) ? { ...item, status: 'ebay_queued' as TestItemStatus } : item
        )
      }));
      
      toast.success(`Queued ${itemIds.length} item(s) for eBay sync`);
    } catch (error) {
      console.error('Failed to queue for eBay:', error);
      toast.error('Failed to queue for eBay');
    }
  }, []);

  // Process eBay queue
  const processEbayQueue = useCallback(async () => {
    setState(s => ({ ...s, isEbaySyncing: true }));
    
    try {
      // Update status to processing
      setState(s => ({
        ...s,
        testItems: s.testItems.map(item => 
          item.status === 'ebay_queued' ? { ...item, status: 'ebay_processing' as TestItemStatus } : item
        )
      }));
      
      const { data, error } = await supabase.functions.invoke('ebay-sync-processor', {
        body: { limit: 10 }
      });
      
      if (error) throw error;
      
      // Fetch updated status from database
      const testItemIds = state.testItems.map(i => i.id);
      const { data: updatedItems } = await supabase
        .from('intake_items')
        .select('id, ebay_sync_status, ebay_sync_error, ebay_listing_id')
        .in('id', testItemIds);
      
      setState(s => ({
        ...s,
        testItems: s.testItems.map(item => {
          const updated = updatedItems?.find(u => u.id === item.id);
          if (updated) {
            const newStatus = updated.ebay_sync_status === 'synced' ? 'ebay_synced' : 
                             updated.ebay_sync_status === 'failed' ? 'ebay_failed' : item.status;
            return { 
              ...item, 
              status: newStatus as TestItemStatus,
              ebay_sync_status: updated.ebay_sync_status,
              ebay_sync_error: updated.ebay_sync_error
            };
          }
          return item;
        }),
        isEbaySyncing: false
      }));
      
      const isDryRun = data?.dryRun;
      toast.success(isDryRun ? '[DRY RUN] eBay processor completed' : 'eBay queue processed');
    } catch (error) {
      console.error('eBay processing failed:', error);
      setState(s => ({ ...s, isEbaySyncing: false }));
      toast.error('eBay processing failed');
    }
  }, [state.testItems]);

  // Print labels for test items
  const printLabels = useCallback(async (
    itemIds: string[], 
    printerName: string, 
    printZpl: (printer: string, zpl: string) => Promise<void>,
    zplTemplate: string
  ) => {
    setState(s => ({ ...s, isPrinting: true }));
    
    try {
      if (state.printDryRun) {
        // Simulate printing in dry run mode
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setState(s => ({
          ...s,
          testItems: s.testItems.map(item => 
            itemIds.includes(item.id) ? { 
              ...item, 
              status: 'printed' as TestItemStatus, 
              printed_at: new Date().toISOString() 
            } : item
          ),
          isPrinting: false
        }));
        
        toast.success(`[DRY RUN] Simulated printing ${itemIds.length} label(s)`);
        return;
      }
      
      for (const itemId of itemIds) {
        const item = state.testItems.find(i => i.id === itemId);
        if (!item) continue;
        
        const labelData = buildLabelDataFromTestItem(item as TestIntakeItem);
        const zpl = zplFromTemplateString(zplTemplate, labelData);
        
        await printZpl(printerName, zpl);
        
        // Update printed status
        setState(s => ({
          ...s,
          testItems: s.testItems.map(i => 
            i.id === itemId ? { ...i, status: 'printed' as TestItemStatus, printed_at: new Date().toISOString() } : i
          )
        }));
      }
      
      toast.success(`Printed ${itemIds.length} label(s)`);
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Print failed');
    } finally {
      setState(s => ({ ...s, isPrinting: false }));
    }
  }, [state.testItems, state.printDryRun]);

  // Cleanup all test items and related records
  const cleanupTestItems = useCallback(async () => {
    setState(s => ({ ...s, isCleaningUp: true }));
    
    try {
      const testItemIds = state.testItems.map(i => i.id);
      const testSkus = state.testItems.map(i => i.sku).filter(Boolean) as string[];
      
      if (testItemIds.length === 0) {
        toast.info('No test items to clean up');
        setState(s => ({ ...s, isCleaningUp: false }));
        return;
      }
      
      // 1. Remove eBay sync logs (by SKU)
      await supabase
        .from('ebay_sync_log')
        .delete()
        .in('sku', testSkus);
      
      // 2. Remove eBay queue entries
      await supabase
        .from('ebay_sync_queue')
        .delete()
        .in('inventory_item_id', testItemIds);
      
      // 3. Remove item snapshots (FK to intake_items)
      await supabase
        .from('item_snapshots')
        .delete()
        .in('intake_item_id', testItemIds);
      
      // 4. Remove audit log entries for these items
      await supabase
        .from('audit_log')
        .delete()
        .eq('table_name', 'intake_items')
        .in('record_id', testItemIds);
      
      // 5. Remove cards entries (by SKU)
      await supabase
        .from('cards')
        .delete()
        .in('sku', testSkus);
      
      // 6. Finally, delete test items
      const { error } = await supabase
        .from('intake_items')
        .delete()
        .in('id', testItemIds);
      
      if (error) throw error;
      
      setState(s => ({
        ...s,
        testItems: [],
        isCleaningUp: false
      }));
      
      toast.success(`Cleaned up ${testItemIds.length} test item(s) and all related records`);
    } catch (error) {
      console.error('Cleanup failed:', error);
      toast.error('Cleanup failed');
      setState(s => ({ ...s, isCleaningUp: false }));
    }
  }, [state.testItems]);

  // Load existing test items from database
  const loadExistingTestItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('intake_items')
        .select('*')
        .like('sku', 'TEST-%')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const itemIds = (data || []).map(i => i.id);
      
      // Check eBay queue status for these items
      const { data: queueData } = await supabase
        .from('ebay_sync_queue')
        .select('inventory_item_id, status')
        .in('inventory_item_id', itemIds);
      
      const queueStatusMap = new Map(
        (queueData || []).map(q => [q.inventory_item_id, q.status])
      );
      
      const itemsWithStatus: TestItemWithStatus[] = (data || []).map(item => {
        // Determine status based on ebay_sync_status, queue status, and shopify status
        let status: TestItemStatus = 'created';
        
        if (item.ebay_sync_status === 'synced' || item.ebay_sync_status === 'dry_run' || item.ebay_listing_id) {
          status = 'ebay_synced';
        } else if (item.ebay_sync_status === 'failed') {
          status = 'ebay_failed';
        } else {
          const queueStatus = queueStatusMap.get(item.id);
          if (queueStatus === 'processing') {
            status = 'ebay_processing';
          } else if (queueStatus === 'queued') {
            status = 'ebay_queued';
          } else if (queueStatus === 'completed') {
            status = 'ebay_synced';
          } else if (queueStatus === 'failed') {
            status = 'ebay_failed';
          } else if (item.shopify_product_id) {
            status = 'shopify_synced';
          }
        }
        
        return {
          ...item,
          status
        };
      }) as TestItemWithStatus[];
      
      setState(s => ({ ...s, testItems: itemsWithStatus }));
    } catch (error) {
      console.error('Failed to load test items:', error);
    }
  }, []);

  // Check eBay dry run mode
  const checkEbayDryRun = useCallback(async () => {
    if (!assignedStore) return;
    try {
      const { data } = await supabase
        .from('ebay_store_config')
        .select('dry_run_mode')
        .eq('store_key', assignedStore)
        .maybeSingle();
      
      setState(s => ({ ...s, ebayDryRunEnabled: data?.dry_run_mode ?? true }));
    } catch (error) {
      console.error('Failed to check eBay config:', error);
    }
  }, [assignedStore]);

  // Delete specific test items by ID
  const deleteSelectedItems = useCallback(async (itemIds: string[]) => {
    if (itemIds.length === 0) {
      toast.info('No items selected');
      return;
    }
    
    setState(s => ({ ...s, isCleaningUp: true }));
    
    try {
      const itemsToDelete = state.testItems.filter(i => itemIds.includes(i.id));
      const skus = itemsToDelete.map(i => i.sku).filter(Boolean) as string[];
      
      // Delete from related tables first
      await supabase.from('ebay_sync_log').delete().in('sku', skus);
      await supabase.from('ebay_sync_queue').delete().in('inventory_item_id', itemIds);
      await supabase.from('item_snapshots').delete().in('intake_item_id', itemIds);
      await supabase.from('audit_log').delete().eq('table_name', 'intake_items').in('record_id', itemIds);
      await supabase.from('cards').delete().in('sku', skus);
      
      // Delete intake items
      const { error } = await supabase.from('intake_items').delete().in('id', itemIds);
      if (error) throw error;
      
      setState(s => ({
        ...s,
        testItems: s.testItems.filter(i => !itemIds.includes(i.id)),
        isCleaningUp: false
      }));
      
      toast.success(`Deleted ${itemIds.length} test item(s)`);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Delete failed');
      setState(s => ({ ...s, isCleaningUp: false }));
    }
  }, [state.testItems]);

  // Toggle Shopify dry run
  const toggleShopifyDryRun = useCallback(() => {
    setState(s => ({ ...s, shopifyDryRun: !s.shopifyDryRun }));
  }, []);

  // Toggle Print dry run
  const togglePrintDryRun = useCallback(() => {
    setState(s => ({ ...s, printDryRun: !s.printDryRun }));
  }, []);

  return {
    ...state,
    assignedStore,
    selectedLocation,
    generateItems,
    syncToShopify,
    queueForEbay,
    processEbayQueue,
    printLabels,
    cleanupTestItems,
    deleteSelectedItems,
    loadExistingTestItems,
    checkEbayDryRun,
    toggleShopifyDryRun,
    togglePrintDryRun
  };
}
