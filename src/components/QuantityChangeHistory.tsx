import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ShoppingCart, 
  ArrowLeftRight, 
  RefreshCw, 
  Package, 
  Upload,
  RotateCcw,
  AlertCircle,
  User,
  Store
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface QuantityChangeHistoryProps {
  itemId: string;
  sku?: string;
}

interface ChangeEvent {
  id: string;
  date: string;
  action: string;
  description: string;
  details?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'success' | 'warning' | 'destructive';
}

// Map location GIDs to friendly names
const useLocationNames = () => {
  return useQuery({
    queryKey: ['shopify-location-names'],
    queryFn: async () => {
      const { data } = await supabase
        .from('shopify_location_cache')
        .select('location_gid, location_name');
      
      const map = new Map<string, string>();
      data?.forEach(loc => {
        if (loc.location_gid && loc.location_name) {
          map.set(loc.location_gid, loc.location_name);
        }
      });
      return map;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Parse updated_by field into human-readable description
function parseUpdatedBy(
  updatedBy: string | null, 
  locationGid: string | null,
  locationNames: Map<string, string>
): { action: string; description: string; icon: React.ComponentType<{ className?: string }>; variant: 'default' | 'success' | 'warning' | 'destructive' } {
  if (!updatedBy) {
    return { action: 'Updated', description: 'Unknown update', icon: RefreshCw, variant: 'default' };
  }

  const locationName = locationGid ? locationNames.get(locationGid) : null;
  const locationSuffix = locationName ? ` – ${locationName}` : '';

  // Shopify POS sales
  if (updatedBy.includes('shopify_webhook') && updatedBy.includes('sale')) {
    return { 
      action: 'Sold', 
      description: `Sold on Shopify POS${locationSuffix}`,
      icon: ShoppingCart,
      variant: 'success'
    };
  }

  // Shopify inventory sync (webhook updates)
  if (updatedBy === 'shopify_webhook' || updatedBy === 'shopify_sync') {
    return { 
      action: 'Synced', 
      description: `Synced from Shopify${locationSuffix}`,
      icon: RefreshCw,
      variant: 'default'
    };
  }

  // Order cancellation
  if (updatedBy === 'shopify_webhook_cancellation') {
    return { 
      action: 'Restored', 
      description: `Restored after order cancellation${locationSuffix}`,
      icon: RotateCcw,
      variant: 'warning'
    };
  }

  // Refund
  if (updatedBy === 'shopify_webhook_refund') {
    return { 
      action: 'Restored', 
      description: `Restored after refund${locationSuffix}`,
      icon: RotateCcw,
      variant: 'warning'
    };
  }

  // Inventory reconciliation
  if (updatedBy.includes('reconcile') || updatedBy.includes('reconciliation')) {
    return { 
      action: 'Corrected', 
      description: `Corrected by reconciliation${locationSuffix}`,
      icon: RefreshCw,
      variant: 'warning'
    };
  }

  // Transfer operations
  if (updatedBy.includes('transfer')) {
    return { 
      action: 'Transferred', 
      description: `Adjusted during transfer${locationSuffix}`,
      icon: ArrowLeftRight,
      variant: 'default'
    };
  }

  // Inventory RPC (manual adjustments)
  if (updatedBy === 'inventory_rpc') {
    return { 
      action: 'Adjusted', 
      description: `Manual inventory adjustment${locationSuffix}`,
      icon: Package,
      variant: 'default'
    };
  }

  // Push to Shopify
  if (updatedBy === 'shopify_push' || updatedBy.includes('push')) {
    return { 
      action: 'Published', 
      description: `Pushed to Shopify${locationSuffix}`,
      icon: Upload,
      variant: 'success'
    };
  }

  // Removal from Shopify
  if (updatedBy === 'shopify_remove_raw' || updatedBy.includes('remove')) {
    return { 
      action: 'Removed', 
      description: `Removed from Shopify${locationSuffix}`,
      icon: AlertCircle,
      variant: 'destructive'
    };
  }

  // User ID (UUID format)
  if (updatedBy.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return { 
      action: 'Manual Edit', 
      description: `Edited by staff${locationSuffix}`,
      icon: User,
      variant: 'default'
    };
  }

  // Default fallback
  return { 
    action: 'Updated', 
    description: updatedBy.replace(/_/g, ' '),
    icon: RefreshCw,
    variant: 'default'
  };
}

export function QuantityChangeHistory({ itemId, sku }: QuantityChangeHistoryProps) {
  const { data: locationNames = new Map() } = useLocationNames();

  // Fetch item snapshots for history
  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['item-snapshots', itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_snapshots')
        .select('*')
        .eq('intake_item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch sales events for this SKU
  const { data: salesEvents, isLoading: salesLoading } = useQuery({
    queryKey: ['sales-events', sku],
    queryFn: async () => {
      if (!sku) return [];
      
      const { data, error } = await supabase
        .from('sales_events')
        .select('*')
        .eq('sku', sku)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!sku,
  });

  // Fetch current item for latest state
  const { data: currentItem } = useQuery({
    queryKey: ['intake-item-audit', itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intake_items')
        .select('updated_by, updated_at, shopify_location_gid, quantity, sold_at, sold_channel, sold_order_id')
        .eq('id', itemId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const isLoading = snapshotsLoading || salesLoading;

  // Build combined timeline of events
  const events: ChangeEvent[] = [];

  // Add current state as the most recent event
  if (currentItem?.updated_at) {
    const parsed = parseUpdatedBy(currentItem.updated_by, currentItem.shopify_location_gid, locationNames);
    events.push({
      id: 'current',
      date: currentItem.updated_at,
      action: parsed.action,
      description: parsed.description,
      details: currentItem.sold_at 
        ? `Qty: ${currentItem.quantity} • Sold via ${currentItem.sold_channel || 'unknown'}`
        : `Qty: ${currentItem.quantity}`,
      icon: parsed.icon,
      variant: parsed.variant,
    });
  }

  // Add snapshots
  snapshots?.forEach((snapshot, index) => {
    const snapshotData = snapshot.snapshot_data as any;
    const quantity = snapshotData?.quantity;
    const updatedBy = snapshotData?.updated_by;
    const locationGid = snapshotData?.shopify_location_gid;
    
    const parsed = parseUpdatedBy(updatedBy, locationGid, locationNames);
    
    let actionLabel = snapshot.snapshot_type;
    if (snapshot.snapshot_type === 'UPDATE') actionLabel = 'Updated';
    if (snapshot.snapshot_type === 'INSERT') actionLabel = 'Created';
    if (snapshot.snapshot_type === 'printed') actionLabel = 'Printed';
    if (snapshot.snapshot_type === 'pushed') actionLabel = 'Published';

    events.push({
      id: snapshot.id,
      date: snapshot.created_at,
      action: actionLabel,
      description: parsed.description,
      details: quantity !== undefined ? `Qty: ${quantity}` : undefined,
      icon: parsed.icon,
      variant: parsed.variant,
    });
  });

  // Add sales events
  salesEvents?.forEach(event => {
    let action = 'Sale Event';
    let description = event.source_event_id || 'Unknown event';
    let variant: 'default' | 'success' | 'warning' | 'destructive' = 'default';
    let IconComponent = Store;

    if (event.source_event_id?.includes('cancellation')) {
      action = 'Cancellation';
      description = 'Order cancelled - inventory restored';
      variant = 'warning';
      IconComponent = RotateCcw;
    } else if (event.source_event_id?.includes('refund')) {
      action = 'Refund';
      description = 'Order refunded - inventory restored';
      variant = 'warning';
      IconComponent = RotateCcw;
    } else if (event.status === 'processed') {
      action = 'Sale Processed';
      description = `Sold via ${event.source}`;
      variant = 'success';
      IconComponent = ShoppingCart;
    }

    events.push({
      id: event.id,
      date: event.created_at,
      action,
      description,
      details: event.status ? `Status: ${event.status}` : undefined,
      icon: IconComponent,
      variant,
    });
  });

  // Sort by date descending
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Deduplicate by date (within 1 second)
  const deduped = events.filter((event, index, arr) => {
    if (index === 0) return true;
    const prevDate = new Date(arr[index - 1].date).getTime();
    const currDate = new Date(event.date).getTime();
    return Math.abs(prevDate - currDate) > 1000;
  });

  const getVariantClasses = (variant: string) => {
    switch (variant) {
      case 'success': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'warning': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'destructive': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Quantity History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Why did this quantity change?
        </CardTitle>
      </CardHeader>
      <CardContent>
        {deduped.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>No quantity change history available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deduped.slice(0, 10).map((event, index) => {
              const IconComponent = event.icon;
              const isLast = index === Math.min(deduped.length - 1, 9);
              
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`p-2 rounded-full ${getVariantClasses(event.variant)}`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    {!isLast && (
                      <div className="w-px h-6 bg-border mt-1" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-medium">
                        {event.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.date), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{event.description}</p>
                    {event.details && (
                      <p className="text-xs text-muted-foreground mt-0.5">{event.details}</p>
                    )}
                  </div>
                </div>
              );
            })}
            
            {deduped.length > 10 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                Showing 10 of {deduped.length} events
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
