import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Pencil, Send, Trash2, Eye, Plus, Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import EditIntakeItemDialog from "./EditIntakeItemDialog";
import { useStore } from "@/contexts/StoreContext";
import { logStoreContext, validateCompleteStoreContext } from "@/utils/storeValidation";

import { useBatchSendToShopify } from '@/hooks/useBatchSendToShopify';
import { useBatchAutoProcessSettings } from '@/hooks/useBatchAutoProcessSettings';
import { BatchConfigDialog } from '@/components/BatchConfigDialog';
import { BatchProgressDialog } from '@/components/BatchProgressDialog';
import { useLogger } from '@/hooks/useLogger';
import { useCurrentBatch } from '@/hooks/useCurrentBatch';
import { useSession } from '@/hooks/useSession';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useSendToInventory } from '@/hooks/useSendToInventory';

import type { IntakeItem } from "@/types/intake";

interface CurrentBatchPanelProps {
  onViewFullBatch?: () => void;
  onBatchCountUpdate?: (count: number) => void;
  compact?: boolean;
}

export const CurrentBatchPanel = ({ onViewFullBatch, onBatchCountUpdate, compact = false }: CurrentBatchPanelProps) => {
  const logger = useLogger('CurrentBatchPanel');
  const queryClient = useQueryClient();
  const { assignedStore, selectedLocation, availableLocations } = useStore();
  const { data: session } = useSession();
  
  // Use React Query for batch data
  const { data: batchData, isLoading: loading, refetch } = useCurrentBatch({
    storeKey: assignedStore,
    locationGid: selectedLocation,
    userId: session?.user?.id
  });
  
  const recentItems = batchData?.items || [];
  const counts = batchData?.counts || { activeItems: 0, totalItems: 0 };
  const [editingItem, setEditingItem] = useState<IntakeItem | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const [batchConfigOpen, setBatchConfigOpen] = useState(false);
  const [vendors, setVendors] = useState<Array<{ vendor_name: string; is_default: boolean }>>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [batchProgressOpen, setBatchProgressOpen] = useState(false);

  const { sendChunkedBatchToShopify, isSending, progress } = useBatchSendToShopify();
  const { getAutoProcessConfig, getProcessingMode } = useBatchAutoProcessSettings();
  const sendToInventory = useSendToInventory();

  // Helper to format card name
  const formatCardName = (item: IntakeItem) => {
    const parts = []
    
    // Add year at the start if available (check both direct field and catalog_snapshot)
    const year = item.year || (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null && 'year' in item.catalog_snapshot ? item.catalog_snapshot.year : null);
    if (year) parts.push(year)
    
    // Add brand/set
    if (item.brand_title) parts.push(item.brand_title)
    
    // Add subject (like card name)
    if (item.subject) parts.push(item.subject)
    
    // Add variety from catalog_snapshot if not already in subject (for comics)
    const variety = item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null && 'varietyPedigree' in item.catalog_snapshot ? item.catalog_snapshot.varietyPedigree : null;
    if (variety && item.subject && !item.subject.includes(String(variety))) {
      parts.push(String(variety))
    }
    
    // Add card number
    if (item.card_number) parts.push(`#${item.card_number}`)
    
    // Handle grading - use PSA for PSA certs
    if (item.grade && item.psa_cert) {
      parts.push(`PSA ${item.grade}`)
    } else if (item.grade) {
      parts.push(`Grade ${item.grade}`)
    } else if (item.psa_cert) {
      parts.push(`PSA ${item.psa_cert}`)
    }
    
    return parts.length > 0 ? parts.join(' ') : (item.sku || 'Unknown Item')
  }

  // Helper to get condition for raw cards
  const getCondition = (item: IntakeItem) => {
    // For raw cards, check catalog_snapshot for condition
    if (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null) {
      if ('condition' in item.catalog_snapshot && item.catalog_snapshot.condition) {
        return item.catalog_snapshot.condition;
      }
    }
    
    // Fallback to variant if no condition found
    const variant = item.variant || (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null && 'varietyPedigree' in item.catalog_snapshot ? item.catalog_snapshot.varietyPedigree : null);
    return variant;
  }

  // Helper to get additional variant info (like foil)
  const getVariantInfo = (item: IntakeItem) => {
    if (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null) {
      const parts = [];
      
      // Add foil if present
      if ('foil' in item.catalog_snapshot && item.catalog_snapshot.foil) {
        parts.push('Foil');
      }
      
      // Add language if not English
      if ('language' in item.catalog_snapshot && item.catalog_snapshot.language && item.catalog_snapshot.language !== 'English') {
        parts.push(item.catalog_snapshot.language);
      }
      
      // Add variant from item if present and not a condition
      if (item.variant && !['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'].includes(item.variant)) {
        parts.push(item.variant);
      }
      
      return parts.join(', ');
    }
    
    // Fallback to item variant if no catalog_snapshot
    if (item.variant && !['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'].includes(item.variant)) {
      return item.variant;
    }
    
    return null;
  }

  const canDeleteFromBatch = (item: IntakeItem) => {
    return !item.removed_from_batch_at;
  };

  const isBulkItem = (item: IntakeItem) => {
    return item.variant === 'Bulk' || 
           (item.catalog_snapshot && 
            typeof item.catalog_snapshot === 'object' && 
            item.catalog_snapshot !== null &&
            'type' in item.catalog_snapshot && 
            item.catalog_snapshot.type === 'card_bulk');
  };

  const handleEditItem = (item: IntakeItem) => {
    setEditingItem(item);
  };

  const handleSendToInventory = async (itemId: string) => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }
    
    try {
      await sendToInventory.mutateAsync({
        storeKey: assignedStore,
        locationGid: selectedLocation,
        itemIds: [itemId],
      });
      
      toast({ 
        title: "Success", 
        description: "Item sent to inventory" 
      });
    } catch (error: any) {
      logger.logError('Error sending to inventory', error);
      toast({ 
        title: "Error Sending to Inventory", 
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase.rpc("soft_delete_intake_item", {
        item_id: itemId,
        reason_in: "Deleted from current batch"
      });

      if (error) throw error;

      toast({ title: "Success", description: "Item removed from batch" });
      refetch();
    } catch (error: any) {
      logger.logError('Error deleting item', error);
      toast({ title: "Error", description: error.message });
    }
  };

  const handleClearBatch = async () => {
    if (recentItems.length === 0) {
      toast({ title: "Info", description: "No items to clear" });
      return;
    }

    try {
      // Delete all items in current batch
      const itemIds = recentItems.map(item => item.id);
      const { error } = await supabase.rpc("soft_delete_intake_items", {
        ids: itemIds,
        reason: "Batch cleared"
      });

      if (error) throw error;

      toast({ title: "Success", description: "Batch cleared" });
      refetch();
    } catch (error: any) {
      logger.logError('Error clearing batch', error);
      toast({ title: "Error", description: error.message });
    }
  };

  const handleStartNewLot = async () => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }

    try {
      const { data, error } = await supabase.rpc("force_new_lot", {
        _store_key: assignedStore,
        _location_gid: selectedLocation,
        _reason: "Manually started new lot"
      });

      if (error) throw error;

      toast({ title: "Success", description: "New lot started" });
      refetch();
    } catch (error: any) {
      logger.logError('Error starting new lot', error);
      toast({ title: "Error", description: error.message });
    }
  };

  const handleSendBatchToShopify = async () => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }
    
    const itemIds = recentItems.map(item => item.id);
    if (itemIds.length === 0) {
      toast({ title: "Info", description: "No items in current batch" });
      return;
    }

    logger.logInfo('Starting batch send to Shopify', {
      itemCount: itemIds.length,
      storeKey: assignedStore,
      locationGid: selectedLocation
    });

    // Always show configuration dialog for vendor selection and batch settings
    setBatchConfigOpen(true);
  };

  const handleManualBatchConfig = async (config: any) => {
    if (!assignedStore || !selectedLocation) {
      toast({ title: "Error", description: "Store context missing" });
      return;
    }
    
    const itemIds = recentItems.map(item => item.id);
    setBatchConfigOpen(false);
    setBatchProgressOpen(true);
    
    try {
      const result = await sendChunkedBatchToShopify(
        itemIds,
        assignedStore as "hawaii" | "las_vegas",
        selectedLocation,
        config,
        undefined,
        false // manual config
      );
      
      if (result.ok) {
        await refetch();
        toast({ title: "Success", description: `Processed ${result.processed} items successfully` });
      }
    } catch (error) {
      logger.logError('Manual batch processing failed', error instanceof Error ? error : new Error(String(error)));
      toast({ title: "Error", description: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setBatchProgressOpen(false);
    }
  };

  // Load vendors when store changes
  useEffect(() => {
  const loadVendors = async () => {
      if (!assignedStore) {
        return;
      }
      
      setLoadingVendors(true);
      try {
        const { data, error } = await supabase
          .from('shopify_location_vendors')
          .select('vendor_name, is_default')
          .eq('store_key', assignedStore)
          .is('location_gid', null)
          .order('is_default', { ascending: false })
          .order('vendor_name', { ascending: true });

        if (error) throw error;

        setVendors(data || []);
        
        // Auto-select default vendor
        const defaultVendor = data?.find(v => v.is_default);
        if (defaultVendor && !selectedVendor) {
          setSelectedVendor(defaultVendor.vendor_name);
        }
      } catch (error) {
        toast({ 
          title: "Warning", 
          description: "Failed to load vendors. You may need to configure vendors in settings." 
        });
      } finally {
        setLoadingVendors(false);
      }
    };

    loadVendors();
  }, [assignedStore]);

  if (loading) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Current Batch</CardTitle>
        <div className="text-sm text-muted-foreground">
          Store: {assignedStore || 'None'} | Location: {selectedLocation ? (availableLocations?.find(l => l.gid === selectedLocation)?.name || 'Unknown') : 'None'}
        </div>
      </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className={`flex flex-row items-center justify-between space-y-0 ${compact ? 'pb-2' : 'pb-4'}`}>
          <div>
            <CardTitle className={compact ? 'text-lg' : ''}>Current Batch</CardTitle>
            <p className="text-sm text-muted-foreground">
              {counts.activeItems} active items • Store: {assignedStore || 'None'} | Location: {selectedLocation ? (availableLocations?.find(l => l.gid === selectedLocation)?.name || 'Unknown') : 'None'}
            </p>
          </div>
          {!compact && (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSendBatchToShopify();
                }}
                disabled={recentItems.length === 0 || isSending}
                size="sm"
                style={{ position: 'relative', zIndex: 9999 }}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send to Inventory
              </Button>
            </div>
          )}
        </CardHeader>
        
        {/* Vendor Selector */}
        {!compact && (
          <div className="px-6 pb-4 border-b">
            <div className="flex items-center gap-3">
              <Label htmlFor="vendor-select" className="text-sm font-medium whitespace-nowrap">
                Vendor:
              </Label>
              <Select 
                value={selectedVendor} 
                onValueChange={setSelectedVendor}
                disabled={loadingVendors || vendors.length === 0}
              >
                <SelectTrigger id="vendor-select" className="h-9 w-[200px]">
                  <SelectValue placeholder={
                    loadingVendors ? "Loading vendors..." : 
                    vendors.length === 0 ? "No vendors configured" :
                    "Select vendor"
                  } />
                </SelectTrigger>
                <SelectContent className="z-[10000] bg-background border shadow-md">
                  {vendors.length === 0 ? (
                    <SelectItem value="_none_" disabled>
                      No vendors available
                    </SelectItem>
                  ) : (
                    vendors.map((vendor) => (
                      <SelectItem key={vendor.vendor_name} value={vendor.vendor_name}>
                        {vendor.vendor_name} {vendor.is_default && "(default)"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {vendors.length === 0 && !loadingVendors && (
                <span className="text-xs text-muted-foreground">
                  Configure vendors in Admin settings
                </span>
              )}
            </div>
          </div>
        )}
        
        <CardContent>
          {recentItems.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No items in batch</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Scan or import items to get started. Your batch will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentItems.slice(0, compact ? 5 : recentItems.length).map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between ${compact ? 'p-2' : 'p-3'} border rounded-lg group hover:bg-muted/50`}
                >
                  <div className="flex-1 cursor-pointer" onClick={() => handleEditItem(item)}>
                    <div className={`font-medium ${compact ? 'text-sm' : ''}`}>{formatCardName(item)}</div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>
                        {compact ? (
                          `$${item.price} • Qty: ${item.quantity}`
                        ) : (
                          `${item.sku} • $${item.price} ${item.cost && `• Cost: $${Number(item.cost).toFixed(2)}`} • Qty: ${item.quantity}`
                        )}
                      </div>
                      {/* Show condition for raw cards only */}
                      {getCondition(item) && (
                        <div className="text-xs">
                          <span className="font-medium">Condition:</span> {getCondition(item)}
                        </div>
                      )}
                      {/* Show category badges */}
                      {(item.main_category || item.sub_category) && (
                        <div className="flex flex-wrap gap-1 items-center mt-1">
                          {item.main_category && (
                            <Badge variant="secondary" className="text-xs h-5">
                              {item.main_category === 'tcg' && '🎴 TCG'}
                              {item.main_category === 'comics' && '📚 Comics'}
                            </Badge>
                          )}
                          {item.sub_category && (
                            <Badge variant="outline" className="text-xs h-5">
                              {item.sub_category}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`flex gap-1 ${compact ? 'opacity-0 group-hover:opacity-100 transition-opacity' : 'gap-2'}`}>
                    {compact && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditItem(item)}
                        className="h-8 w-8 p-0"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {!compact && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditItem(item);
                          }}
                          style={{ position: 'relative', zIndex: 9999 }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSendToInventory(item.id);
                          }}
                          style={{ position: 'relative', zIndex: 9999 }}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={compact ? "ghost" : "outline"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteItem(item.id);
                      }}
                      className={compact ? "h-8 w-8 p-0 text-destructive hover:text-destructive" : ""}
                      style={{ position: 'relative', zIndex: 9999 }}
                    >
                      <Trash2 className={compact ? "h-3 w-3" : "h-4 w-4"} />
                    </Button>
                  </div>
                </div>
              ))}
              {compact && recentItems.length > 5 && (
                <div className="text-center text-sm text-muted-foreground pt-2">
                  ... and {recentItems.length - 5} more items
                </div>
              )}
            </div>
          )}
          
          {recentItems.length > 0 && !compact && (
            <div className="mt-4 pt-4 border-t flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClearBatch();
                }}
                size="sm"
                style={{ position: 'relative', zIndex: 9999 }}
              >
                Clear Batch
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleStartNewLot();
                }}
                size="sm"
                style={{ position: 'relative', zIndex: 9999 }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Start New Lot
              </Button>
              {onViewFullBatch && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onViewFullBatch?.();
                  }}
                  size="sm"
                  style={{ position: 'relative', zIndex: 9999 }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Batch
                </Button>
              )}
            </div>
          )}
          
          {compact && recentItems.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSendBatchToShopify();
                }}
                disabled={recentItems.length === 0 || sendingBatch}
                style={{ position: 'relative', zIndex: 9999 }}
                size="sm"
                className="w-full"
              >
                {sendingBatch ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send to Inventory
              </Button>
              <Button
                variant="outline"
                onClick={() => window.dispatchEvent(new CustomEvent('switchToBatchTab'))}
                size="sm"
                className="w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Full Batch
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {editingItem && (
        <EditIntakeItemDialog
          item={{
            id: editingItem.id,
            year: editingItem.year || (editingItem.catalog_snapshot?.year) || '',
            brandTitle: editingItem.brand_title || (editingItem.catalog_snapshot?.set) || '',
            subject: editingItem.subject || (editingItem.catalog_snapshot?.name) || '',
            
            variant: editingItem.variant || 
                    (editingItem.catalog_snapshot?.foil ? 'Foil' : '') || 
                    (editingItem.catalog_snapshot?.varietyPedigree) || '',
            condition: editingItem.catalog_snapshot?.condition || 
                      (editingItem.variant?.includes('Near Mint') ? 'Near Mint' : 
                       editingItem.variant?.includes('Lightly Played') ? 'Lightly Played' :
                       editingItem.variant?.includes('Moderately Played') ? 'Moderately Played' :
                       editingItem.variant?.includes('Heavily Played') ? 'Heavily Played' :
                       editingItem.variant?.includes('Damaged') ? 'Damaged' : ''),
            cardNumber: String(editingItem.card_number || editingItem.catalog_snapshot?.number || ''),
            grade: editingItem.grade,
            gradingCompany: editingItem.grading_company || 'PSA',
            psaCert: editingItem.psa_cert || (editingItem.catalog_snapshot?.psaCert) || '',
            price: editingItem.price?.toString() || (editingItem.catalog_snapshot?.entered_price?.toString()) || '',
            cost: editingItem.cost?.toString() || (editingItem.catalog_snapshot?.calculated_cost?.toString()) || '',
            sku: editingItem.sku || (editingItem.catalog_snapshot?.tcgplayer_id) || '',
            quantity: editingItem.quantity,
            imageUrl: editingItem.image_urls?.[0] || 
                     (editingItem.catalog_snapshot?.photo_url) ||
                     (editingItem.catalog_snapshot?.image_url) || 
                     (editingItem.catalog_snapshot?.imageUrl) || 
                     (editingItem.catalog_snapshot?.image_urls?.[0]) || '',
            mainCategory: editingItem.main_category,
            subCategory: editingItem.sub_category
          }}
          open={!!editingItem}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null);
          }}
          onSave={async (values) => {
            try {
              logger.logDebug('Saving item with values', { itemId: values.id, brandTitle: values.brandTitle });
              
              // Update the intake item in the database
              const { error } = await supabase
                .from('intake_items')
                .update({
                  year: values.year,
                  brand_title: values.brandTitle,
                  subject: values.subject,
                  
                  variant: values.variant,
                  card_number: values.cardNumber,
                  grade: values.grade,
                  grading_company: values.gradingCompany,
                  psa_cert: values.psaCert,
                  price: values.price ? parseFloat(values.price) : null,
                  cost: values.cost ? parseFloat(values.cost) : null,
                  sku: values.sku,
                  quantity: values.quantity,
                  image_urls: values.imageUrl ? [values.imageUrl] : null,
                  main_category: values.mainCategory,
                  sub_category: values.subCategory,
                  // Update catalog_snapshot with new values to preserve TCGPlayer data
                  catalog_snapshot: editingItem.catalog_snapshot ? {
                    ...editingItem.catalog_snapshot,
                    name: values.subject,
                    set: values.brandTitle,
                    number: values.cardNumber,
                    condition: values.condition || editingItem.catalog_snapshot.condition,
                    foil: values.variant?.toLowerCase().includes('foil') || editingItem.catalog_snapshot.foil,
                    entered_price: values.price ? parseFloat(values.price) : editingItem.catalog_snapshot.entered_price,
                    calculated_cost: values.cost ? parseFloat(values.cost) : editingItem.catalog_snapshot.calculated_cost,
                    photo_url: values.imageUrl || editingItem.catalog_snapshot.photo_url,
                    image_urls: values.imageUrl ? [values.imageUrl] : editingItem.catalog_snapshot.image_urls
                  } : null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', values.id);

              if (error) {
                logger.logError('Error updating item', error instanceof Error ? error : new Error(String(error)), { itemId: values.id });
                toast({
                  title: "Error",
                  description: "Failed to update item. Please try again.",
                  variant: "destructive",
                });
                return;
              }

              toast({
                title: "Success",
                description: "Item updated successfully!",
              });
              
              setEditingItem(null);
              refetch();
            } catch (error) {
              logger.logError('Error updating item', error instanceof Error ? error : new Error(String(error)), { itemId: values?.id });
              toast({
                title: "Error", 
                description: "Failed to update item. Please try again.",
                variant: "destructive",
              });
            }
          }}
        />
      )}

      {/* Batch Configuration Dialog */}
      <BatchConfigDialog
        itemCount={recentItems.length}
        onStartBatch={handleManualBatchConfig}
        open={batchConfigOpen}
        onOpenChange={setBatchConfigOpen}
        storeKey={assignedStore || undefined}
        initialVendor={selectedVendor}
      />

      {/* Batch Progress Dialog */}
      <BatchProgressDialog
        open={batchProgressOpen}
        progress={progress}
        onCancel={() => setBatchProgressOpen(false)}
      />
    </>
  );
};
