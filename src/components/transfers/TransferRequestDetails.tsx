import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRegionalDateTime } from '@/hooks/useRegionalDateTime';
import { toast } from 'sonner';
import { useState } from 'react';
import { 
  Package, 
  Truck,
  CheckCircle,
  Calendar,
  User,
  ArrowRight,
  Loader2
} from 'lucide-react';

interface TransferItem {
  id: string;
  sku: string;
  item_name: string | null;
  quantity: number;
  status: string;
  received_at: string | null;
}

interface TransferRequest {
  id: string;
  created_at: string;
  created_by: string | null;
  source_region: string;
  destination_region: string;
  status: string;
  priority: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  tracking_number: string | null;
  estimated_arrival: string | null;
  total_items: number;
}

interface TransferRequestDetailsProps {
  request: TransferRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const REGION_DISPLAY: Record<string, { icon: string; label: string }> = {
  hawaii: { icon: '🌺', label: 'Hawaii' },
  las_vegas: { icon: '🎰', label: 'Las Vegas' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  approved: 'bg-blue-500',
  rejected: 'bg-red-500',
  in_transit: 'bg-purple-500',
  completed: 'bg-green-500',
  cancelled: 'bg-gray-500',
};

export function TransferRequestDetails({ request, open, onOpenChange, onUpdate }: TransferRequestDetailsProps) {
  const { assignedRegion } = useStore();
  const { formatDateTime, formatDate } = useRegionalDateTime();
  const queryClient = useQueryClient();
  const [trackingNumber, setTrackingNumber] = useState(request.tracking_number || '');
  const [estimatedArrival, setEstimatedArrival] = useState(request.estimated_arrival || '');

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['transfer-items', request.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cross_region_transfer_items')
        .select('*')
        .eq('request_id', request.id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as TransferItem[];
    },
  });

  const updateRequest = useMutation({
    mutationFn: async (updates: Partial<TransferRequest>) => {
      const { error } = await supabase
        .from('cross_region_transfer_requests')
        .update(updates)
        .eq('id', request.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-region-transfers'] });
      onUpdate();
      toast.success('Transfer updated');
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const markAsShipped = () => {
    updateRequest.mutate({
      status: 'in_transit',
      tracking_number: trackingNumber || null,
      estimated_arrival: estimatedArrival || null,
    });
  };

  const isOutbound = request.source_region === assignedRegion;
  const canShip = isOutbound && request.status === 'approved';
  const canReceive = !isOutbound && request.status === 'in_transit';

  const sourceRegion = REGION_DISPLAY[request.source_region] || { icon: '📍', label: request.source_region };
  const destRegion = REGION_DISPLAY[request.destination_region] || { icon: '📍', label: request.destination_region };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Transfer Details
          </DialogTitle>
          <DialogDescription>
            View and manage this transfer request
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Route & Status */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <span className="text-2xl">{sourceRegion.icon}</span>
                <p className="text-xs text-muted-foreground">{sourceRegion.label}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="text-center">
                <span className="text-2xl">{destRegion.icon}</span>
                <p className="text-xs text-muted-foreground">{destRegion.label}</p>
              </div>
            </div>
            <Badge className={`${STATUS_COLORS[request.status]} text-white capitalize`}>
              {request.status.replace('_', ' ')}
            </Badge>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Created:</span>
              <span>{formatDateTime(request.created_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Items:</span>
              <span>{request.total_items}</span>
            </div>
            {request.approved_at && (
              <div className="flex items-center gap-2 col-span-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Approved:</span>
                <span>{formatDateTime(request.approved_at)}</span>
              </div>
            )}
          </div>

          {request.notes && (
            <>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <p className="text-sm mt-1">{request.notes}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Shipping Details (for outbound approved transfers) */}
          {canShip && (
            <div className="space-y-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <h4 className="font-medium flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Ready to Ship
              </h4>
              <div className="space-y-2">
                <div>
                  <Label htmlFor="tracking">Tracking Number</Label>
                  <Input
                    id="tracking"
                    placeholder="Enter tracking number..."
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="eta">Estimated Arrival</Label>
                  <Input
                    id="eta"
                    type="date"
                    value={estimatedArrival}
                    onChange={(e) => setEstimatedArrival(e.target.value)}
                  />
                </div>
                <Button onClick={markAsShipped} disabled={updateRequest.isPending} className="w-full">
                  {updateRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Mark as Shipped
                </Button>
              </div>
            </div>
          )}

          {/* Tracking Info (for in-transit transfers) */}
          {request.status === 'in_transit' && request.tracking_number && (
            <div className="p-3 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="h-4 w-4 text-purple-500" />
                <span className="font-medium">In Transit</span>
              </div>
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Tracking:</span> {request.tracking_number}</p>
                {request.estimated_arrival && (
                  <p><span className="text-muted-foreground">ETA:</span> {formatDate(request.estimated_arrival)}</p>
                )}
              </div>
            </div>
          )}

          {/* Items List */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Items in Transfer</Label>
            <ScrollArea className="h-[200px] border rounded-lg">
              {itemsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items?.length ? (
                <div className="p-2 space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.item_name || 'Unknown Item'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">×{item.quantity}</Badge>
                        {item.status === 'received' && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No items found
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canReceive && (
            <Button 
              onClick={() => updateRequest.mutate({ status: 'completed', completed_at: new Date().toISOString() })}
              disabled={updateRequest.isPending}
            >
              {updateRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark as Received
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
