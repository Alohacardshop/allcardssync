import React, { memo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Package, Calendar, DollarSign, Eye, EyeOff, FileText, Tag, Printer, ExternalLink, RotateCcw, Loader2, CheckSquare, Square, CheckCircle, ShoppingBag, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { EbayPriceComparison } from '@/components/inventory/EbayPriceComparison';
import { EbayStatusBadge } from '@/components/inventory/EbayStatusBadge';
import { checkEbayPrice, generateEbaySearchQuery } from '@/lib/ebayPriceCheck';
import { toast } from 'sonner';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEbayListing } from '@/hooks/useEbayListing';
import type { InventoryItem } from '@/types/inventory';

// Helper function outside component to prevent re-creation on every render
const generateTitle = (item: InventoryItem) => {
  const parts = []
  
  // Add year at the start if available (check both direct field and catalog_snapshot)
  const year = item.year || (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null && 'year' in item.catalog_snapshot ? item.catalog_snapshot.year : null);
  if (year) parts.push(year)
  
  // Add brand
  if (item.brand_title) parts.push(item.brand_title)
  
  // Add subject (like FA/MewTwo VSTAR)
  if (item.subject) parts.push(item.subject)
  
  // Add card number
  if (item.card_number) parts.push(`#${item.card_number}`)
  
  // Add variant after vstar (check both direct field and catalog_snapshot)
  const variant = item.variant || (item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null && 'varietyPedigree' in item.catalog_snapshot ? item.catalog_snapshot.varietyPedigree : null);
  if (variant && variant.toLowerCase() !== 'vstar' && variant.toLowerCase() !== 'normal') {
    parts.push(variant.toLowerCase())
  }
  
  // Handle grading - use grading company for graded certs
  if (item.grade && (item.psa_cert || item.cgc_cert)) {
    const company = item.grading_company || 'PSA';
    parts.push(`${company} ${item.grade}`);
  } else if (item.grade) {
    parts.push(`Grade ${item.grade}`);
  } else if (item.psa_cert) {
    parts.push(`PSA ${item.psa_cert}`);
  } else if (item.cgc_cert) {
    parts.push(`CGC ${item.cgc_cert}`);
  }
  
  return parts.length > 0 ? parts.join(' ') : 'Unknown Item';
};

interface InventoryItemCardProps {
  item: InventoryItem;
  isSelected: boolean;
  isExpanded: boolean;
  isAdmin: boolean;
  syncingRowId: string | null;
  onToggleSelection: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
  onSync: (item: InventoryItem) => void;
  onRetrySync: (item: InventoryItem) => void;
  onResync: (item: InventoryItem) => void;
  onRemove: (item: InventoryItem) => void;
  onDelete?: (item: InventoryItem) => void;
  onSyncDetails: (item: InventoryItem) => void;
}

export const InventoryItemCard = memo(({
  item,
  isSelected,
  isExpanded,
  isAdmin,
  syncingRowId,
  onToggleSelection,
  onToggleExpanded,
  onSync,
  onRetrySync,
  onResync,
  onRemove,
  onDelete,
  onSyncDetails
}: InventoryItemCardProps) => {
  const queryClient = useQueryClient();
  const { toggleListOnEbay, isToggling } = useEbayListing();
  
  // Inline quantity editing state
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [editQty, setEditQty] = useState(item.quantity.toString());
  const [isSavingQty, setIsSavingQty] = useState(false);

  const handleSaveQuantity = async () => {
    const newQty = parseInt(editQty, 10);
    if (isNaN(newQty) || newQty < 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    
    setIsSavingQty(true);
    try {
      // First update the database
      const { error } = await supabase
        .from('intake_items')
        .update({ quantity: newQty })
        .eq('id', item.id);
      
      if (error) throw error;
      
      // If item is synced to Shopify, also update Shopify inventory
      if (item.shopify_product_id && item.shopify_inventory_item_id) {
        try {
          const { data, error: syncError } = await supabase.functions.invoke('v2-shopify-set-inventory', {
            body: { item_id: item.id, quantity: newQty }
          });
          
          if (syncError) {
            console.error('Shopify sync error:', syncError);
            toast.warning(`Quantity updated locally, but Shopify sync failed: ${syncError.message}`);
          } else if (data?.synced_to_shopify) {
            toast.success(`Quantity updated to ${newQty} (synced to Shopify)`);
          } else {
            toast.success(`Quantity updated to ${newQty}`);
          }
        } catch (syncErr: any) {
          console.error('Shopify sync error:', syncErr);
          toast.warning(`Quantity updated locally, but Shopify sync failed`);
        }
      } else {
        toast.success(`Quantity updated to ${newQty}`);
      }
      
      setIsEditingQty(false);
      
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update quantity');
    } finally {
      setIsSavingQty(false);
    }
  };

  const handleCancelEdit = () => {
    setEditQty(item.quantity.toString());
    setIsEditingQty(false);
  };

  // Prefetch item details on hover for instant expansion
  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: ['inventory-item-detail', item.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('intake_items')
          .select(`
            id,
            catalog_snapshot,
            psa_snapshot,
            image_urls,
            shopify_snapshot,
            pricing_snapshot,
            label_snapshot,
            grading_data,
            source_payload,
            processing_notes,
            shopify_sync_snapshot,
            last_shopify_sync_error,
            last_shopify_synced_at,
            pushed_at,
            cost,
            vendor,
            intake_lots(lot_number, status)
          `)
          .eq('id', item.id)
          .single();
        
        if (error) throw error;
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });
  };

  const handleCheckEbayPrice = async () => {
    try {
      const searchQuery = generateEbaySearchQuery(item);
      if (!searchQuery) {
        toast.error('Unable to generate search query for this item');
        return;
      }
      
      toast.loading('Checking eBay prices...', { id: 'ebay-check' });
      
      await checkEbayPrice(item.id, searchQuery, item.price || 0);
      
      toast.success('eBay prices updated!', { id: 'ebay-check' });
      
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to check eBay prices', { id: 'ebay-check' });
    }
  };

  const getStatusBadge = (item: any) => {
    if (item.deleted_at) {
      return <Badge variant="destructive">Deleted</Badge>;
    }
    if (item.sold_at) {
      return <Badge variant="secondary">Sold</Badge>;
    }
    if (item.shopify_sync_status === 'error') {
      return <Badge variant="destructive">Sync Error</Badge>;
    }
    // Synced status requires BOTH status flag AND actual product ID
    if (item.shopify_sync_status === 'synced' && item.shopify_product_id) {
      return <Badge variant="default">Synced</Badge>;
    }
    // Queued or processing for Shopify sync
    if (item.shopify_sync_status === 'queued' || item.shopify_sync_status === 'processing') {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Syncing
        </Badge>
      );
    }
    if (item.shopify_sync_status === 'pending') {
      return <Badge variant="outline">Pending</Badge>;
    }
    // Item has product ID but status doesn't say synced - likely needs resync
    if (item.shopify_product_id && item.shopify_sync_status !== 'synced') {
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Needs Resync</Badge>;
    }
    return <Badge variant="outline">Not Synced</Badge>;
  };

  const getPrintStatusBadge = (item: any) => {
    if (item.printed_at) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 border-green-300">
          <CheckCircle className="h-3 w-3 mr-1" />
          Printed
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
        <Printer className="h-3 w-3 mr-1" />
        Not Printed
      </Badge>
    );
  };

  // Determine border color based on sync status
  const getBorderClass = () => {
    const status = item.shopify_sync_status;
    if (status === 'error' || status === 'failed') return "border-l-destructive";
    if (status === 'synced' && item.shopify_product_id) return "border-l-green-500";
    if (status === 'pending') return "border-l-amber-500";
    if (status === 'success') return "border-l-green-500";
    return "border-l-transparent";
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-200 border-l-4",
        getBorderClass(),
        isSelected && "ring-2 ring-primary",
        item.deleted_at && "opacity-50"
      )}
      onMouseEnter={handleMouseEnter}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleSelection(item.id)}
              className="p-1 h-auto"
            >
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>
            
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-medium truncate">
                {generateTitle(item)}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground font-mono">
                  {item.sku}
                </span>
                {getStatusBadge(item)}
                {getPrintStatusBadge(item)}
                <EbayStatusBadge
                  syncStatus={item.ebay_sync_status}
                  listingId={item.ebay_listing_id}
                  listingUrl={item.ebay_listing_url}
                  syncError={item.ebay_sync_error}
                  listOnEbay={item.list_on_ebay}
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleExpanded(item.id)}
                  >
                    {isExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isExpanded ? 'Hide details' : 'Show details'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center space-x-1 flex-wrap gap-y-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span>${parseFloat(String(item.price || 0)).toFixed(2)}</span>
            {item.ebay_price_check ? (
              <span className="flex items-center space-x-1 text-blue-600">
                <span className="text-muted-foreground">|</span>
                <span className="font-medium">
                  eBay: ${Number(item.ebay_price_check.ebay_average || 0).toFixed(2)}
                </span>
                <span className={
                  Number(item.ebay_price_check.difference_percent || 0) > 0 
                    ? "text-green-600" 
                    : "text-red-600"
                }>
                  ({Number(item.ebay_price_check.difference_percent || 0) > 0 ? '+' : ''}
                  {Number(item.ebay_price_check.difference_percent || 0).toFixed(0)}%)
                </span>
              </span>
            ) : (
              <button
                onClick={handleCheckEbayPrice}
                className="text-blue-500 hover:text-blue-700 hover:underline"
              >
                Check eBay
              </button>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <Package className="h-3 w-3 text-muted-foreground" />
            {isEditingQty ? (
              <div className="flex items-center space-x-1">
                <Input
                  type="number"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="h-6 w-16 text-xs px-1"
                  min={0}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveQuantity();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={handleSaveQuantity}
                  disabled={isSavingQty}
                >
                  {isSavingQty ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 text-green-600" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={handleCancelEdit}
                  disabled={isSavingQty}
                >
                  <X className="h-3 w-3 text-red-600" />
                </Button>
              </div>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex items-center space-x-1 hover:bg-muted rounded px-1 -ml-1 cursor-pointer"
                      onClick={() => {
                        setEditQty(item.quantity.toString());
                        setIsEditingQty(true);
                      }}
                    >
                      <span>Qty: {item.quantity}</span>
                      <Pencil className="h-3 w-3 text-muted-foreground opacity-50" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Click to edit quantity</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span>{item.type || 'Raw'}</span>
            {item.variant && (
              <span className="text-muted-foreground">• {item.variant}</span>
            )}
          </div>
        </div>

        {/* Category badges */}
        {(item.main_category || item.sub_category) && (
          <div className="flex flex-wrap gap-1 items-center">
            {item.main_category && (
              <Badge variant="secondary" className="text-xs">
                {item.main_category === 'tcg' && '🎴 TCG'}
                {item.main_category === 'comics' && '📚 Comics'}
              </Badge>
            )}
            {item.sub_category && (
              <Badge variant="outline" className="text-xs">
                {item.sub_category}
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {item.shopify_sync_status === 'pending' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSync(item)}
              disabled={syncingRowId === item.id}
            >
              {syncingRowId === item.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <ExternalLink className="h-3 w-3 mr-1" />
              )}
              Sync
            </Button>
          )}
          
          {item.shopify_sync_status === 'error' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetrySync(item)}
              disabled={syncingRowId === item.id}
            >
              {syncingRowId === item.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3 mr-1" />
              )}
              Retry
            </Button>
          )}
          
          {item.shopify_sync_status === 'synced' && item.shopify_product_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResync(item)}
              disabled={syncingRowId === item.id}
              title="Re-sync this item to update Shopify product information"
            >
              {syncingRowId === item.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3 mr-1" />
              )}
              Resync
            </Button>
          )}
          
          {item.shopify_product_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRemove(item)}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Remove
            </Button>
          )}
          
          {isAdmin && onDelete && !item.deleted_at && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(item)}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          )}
          
          {/* eBay toggle button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={item.list_on_ebay ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleListOnEbay(item.id, item.list_on_ebay || false)}
                  disabled={isToggling === item.id}
                  className={cn(
                    item.list_on_ebay && "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  {isToggling === item.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-3 w-3 mr-1" />
                  )}
                  eBay
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{item.list_on_ebay ? 'Remove from eBay' : 'Mark for eBay listing'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSyncDetails(item)}
          >
            <FileText className="h-3 w-3 mr-1" />
            Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.sku === nextProps.item.sku &&
    prevProps.item.price === nextProps.item.price &&
    prevProps.item.quantity === nextProps.item.quantity &&
    prevProps.item.shopify_sync_status === nextProps.item.shopify_sync_status &&
    prevProps.item.printed_at === nextProps.item.printed_at &&
    prevProps.item.list_on_ebay === nextProps.item.list_on_ebay &&
    prevProps.item.ebay_sync_status === nextProps.item.ebay_sync_status &&
    prevProps.item.ebay_listing_id === nextProps.item.ebay_listing_id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.syncingRowId === nextProps.syncingRowId
  );
});

InventoryItemCard.displayName = 'InventoryItemCard';