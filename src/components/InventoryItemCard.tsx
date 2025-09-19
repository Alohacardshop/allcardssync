import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Package, Calendar, DollarSign, Eye, EyeOff, FileText, Tag, Printer, ExternalLink, RotateCcw, Loader2, CheckSquare, Square, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InventoryItemCardProps {
  item: any;
  isSelected: boolean;
  isExpanded: boolean;
  isAdmin: boolean;
  syncingRowId: string | null;
  printingItem: string | null;
  onToggleSelection: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
  onSync: (item: any) => void;
  onRetrySync: (item: any) => void;
  onPrint: (item: any) => void;
  onRemove: (item: any) => void;
  onDelete?: (item: any) => void;
  onSyncDetails: (item: any) => void;
}

export const InventoryItemCard = memo(({
  item,
  isSelected,
  isExpanded,
  isAdmin,
  syncingRowId,
  printingItem,
  onToggleSelection,
  onToggleExpanded,
  onSync,
  onRetrySync,
  onPrint,
  onRemove,
  onDelete,
  onSyncDetails
}: InventoryItemCardProps) => {
  const generateTitle = (item: any) => {
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
    
    // Handle grading - use PSA for PSA certs
    if (item.grade && item.psa_cert) {
      parts.push(`PSA ${item.grade}`)
    } else if (item.grade) {
      parts.push(`Grade ${item.grade}`)
    } else if (item.psa_cert) {
      parts.push(`PSA ${item.psa_cert}`)
    }
    
    return parts.length > 0 ? parts.join(' ') : 'Unknown Item';
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
    if (item.shopify_sync_status === 'synced') {
      return <Badge variant="default">Synced</Badge>;
    }
    if (item.shopify_sync_status === 'pending') {
      return <Badge variant="outline">Pending</Badge>;
    }
    return <Badge variant="outline">Unknown</Badge>;
  };

  const getPrintStatusBadge = (item: any) => {
    const itemType = item.type?.toLowerCase() || 'raw';
    if (itemType !== 'raw') return null;
    
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

  return (
    <Card className={cn(
      "transition-all duration-200",
      isSelected && "ring-2 ring-primary",
      item.deleted_at && "opacity-50"
    )}>
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
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground font-mono">
                  {item.sku}
                </span>
                {getStatusBadge(item)}
                {getPrintStatusBadge(item)}
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
          <div className="flex items-center space-x-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span>${parseFloat(item.price || '0').toFixed(2)}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Package className="h-3 w-3 text-muted-foreground" />
            <span>Qty: {item.quantity}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span>{item.type || 'Raw'}</span>
          </div>
        </div>

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
          
          {/* Only show print button for Raw items */}
          {(item.type?.toLowerCase() || 'raw') === 'raw' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPrint(item)}
              disabled={printingItem === item.id}
            >
              {printingItem === item.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Printer className="h-3 w-3 mr-1" />
              )}
              Print Label
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
});

InventoryItemCard.displayName = 'InventoryItemCard';