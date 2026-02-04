import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Package, 
  Printer, 
  Upload, 
  DollarSign, 
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { QuantityChangeHistory } from './QuantityChangeHistory';

interface ItemTimelineProps {
  item: any;
}

export function ItemTimeline({ item }: ItemTimelineProps) {
  const timelineEvents = [];

  // Calculate time in inventory
  const addedToInventory = item.removed_from_batch_at;
  const timeInInventory = addedToInventory 
    ? formatDistanceToNow(new Date(addedToInventory), { addSuffix: false })
    : null;

  // Calculate profit if sold
  const profit = item.sold_at && item.sold_price && item.cost 
    ? (parseFloat(item.sold_price) - parseFloat(item.cost || '0')).toFixed(2)
    : null;

  const profitMargin = profit && item.sold_price 
    ? ((parseFloat(profit) / parseFloat(item.sold_price)) * 100).toFixed(1)
    : null;

  // Build timeline events
  if (item.created_at) {
    timelineEvents.push({
      date: item.created_at,
      title: 'Item Created',
      description: 'Added to intake batch',
      icon: Package,
      status: 'completed'
    });
  }

  if (item.removed_from_batch_at) {
    timelineEvents.push({
      date: item.removed_from_batch_at,
      title: 'Added to Inventory',
      description: 'Moved from batch to active inventory',
      icon: CheckCircle,
      status: 'completed'
    });
  }

  if (item.printed_at) {
    timelineEvents.push({
      date: item.printed_at,
      title: 'Label Printed',
      description: 'Barcode label generated and printed',
      icon: Printer,
      status: 'completed'
    });
  }

  if (item.pushed_at || item.last_shopify_synced_at) {
    timelineEvents.push({
      date: item.pushed_at || item.last_shopify_synced_at,
      title: 'Synced to Shopify',
      description: 'Product published to store',
      icon: Upload,
      status: 'completed'
    });
  }

  if (item.sold_at) {
    timelineEvents.push({
      date: item.sold_at,
      title: 'Item Sold',
      description: `Sold for $${item.sold_price}${item.sold_order_id ? ` (Order: ${item.sold_order_id})` : ''}`,
      icon: DollarSign,
      status: 'completed'
    });
  }

  // Sort by date
  timelineEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {timeInInventory && (
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-sm font-medium">{timeInInventory}</div>
            <div className="text-xs text-muted-foreground">In inventory</div>
          </div>
        )}

        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <DollarSign className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <div className="text-sm font-medium">${item.price || '0.00'}</div>
          <div className="text-xs text-muted-foreground">Listed price</div>
        </div>

        {item.cost && (
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <Package className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-sm font-medium">${item.cost}</div>
            <div className="text-xs text-muted-foreground">Cost basis</div>
          </div>
        )}

        {profit && (
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-600" />
            <div className="text-sm font-medium text-green-600">
              ${profit} ({profitMargin}%)
            </div>
            <div className="text-xs text-muted-foreground">Profit</div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Item Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {timelineEvents.map((event, index) => {
              const IconComponent = event.icon;
              const isLast = index === timelineEvents.length - 1;
              
              return (
                <div key={index} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`p-2 rounded-full ${
                      event.status === 'completed' 
                        ? 'bg-green-100 text-green-600' 
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    {!isLast && (
                      <div className="w-px h-8 bg-border mt-2" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">{event.title}</h4>
                      <Badge variant="outline" className="text-xs">
                        {format(new Date(event.date), 'MMM dd, yyyy')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {event.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.date), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}

            {timelineEvents.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>No timeline events found for this item</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quantity Change History - Staff Audit Trail */}
      <QuantityChangeHistory itemId={item.id} sku={item.sku} />

      {/* Additional Details */}
      {(item.processing_notes || item.shopify_sync_status || item.sku) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {item.sku && (
              <div>
                <span className="text-sm font-medium">SKU: </span>
                <span className="text-sm text-muted-foreground">{item.sku}</span>
              </div>
            )}
            
            {item.shopify_sync_status && (
              <div>
                <span className="text-sm font-medium">Shopify Status: </span>
                <Badge variant={item.shopify_sync_status === 'synced' ? 'default' : 'secondary'}>
                  {item.shopify_sync_status}
                </Badge>
              </div>
            )}

            {item.processing_notes && (
              <div>
                <span className="text-sm font-medium">Notes: </span>
                <p className="text-sm text-muted-foreground mt-1">{item.processing_notes}</p>
              </div>
            )}

            {item.sold_channel && (
              <div>
                <span className="text-sm font-medium">Sold via: </span>
                <Badge variant="outline">{item.sold_channel}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}