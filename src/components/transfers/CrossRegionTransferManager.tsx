import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRegionalDateTime } from '@/hooks/useRegionalDateTime';
import { NewTransferRequestDialog } from './NewTransferRequestDialog';
import { TransferRequestDetails } from './TransferRequestDetails';
import { toast } from 'sonner';
import { 
  Package, 
  Plus, 
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw
} from 'lucide-react';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: 'Pending', color: 'bg-yellow-500', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-500', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-500', icon: XCircle },
  in_transit: { label: 'In Transit', color: 'bg-purple-500', icon: Truck },
  completed: { label: 'Completed', color: 'bg-green-500', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-500', icon: XCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

const REGION_ICONS: Record<string, string> = {
  hawaii: '🌺',
  las_vegas: '🎰',
};

export function CrossRegionTransferManager() {
  const { assignedRegion } = useStore();
  const { user } = useAuth();
  const { formatRelative, formatDate } = useRegionalDateTime();
  const queryClient = useQueryClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TransferRequest | null>(null);
  const [activeTab, setActiveTab] = useState('pending');

  const { data: transfers, isLoading, refetch } = useQuery({
    queryKey: ['cross-region-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cross_region_transfer_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TransferRequest[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, ...updates }: { id: string; status: string; [key: string]: any }) => {
      const { error } = await supabase
        .from('cross_region_transfer_requests')
        .update({ 
          status, 
          ...updates,
          ...(status === 'approved' ? { approved_by: user?.id, approved_at: new Date().toISOString() } : {}),
          ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross-region-transfers'] });
      toast.success('Transfer request updated');
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const pendingTransfers = transfers?.filter(t => t.status === 'pending') || [];
  const inTransitTransfers = transfers?.filter(t => t.status === 'in_transit' || t.status === 'approved') || [];
  const completedTransfers = transfers?.filter(t => t.status === 'completed' || t.status === 'rejected' || t.status === 'cancelled') || [];

  const inboundPending = pendingTransfers.filter(t => t.destination_region === assignedRegion);
  const outboundPending = pendingTransfers.filter(t => t.source_region === assignedRegion);

  const renderTransferCard = (transfer: TransferRequest) => {
    const statusConfig = STATUS_CONFIG[transfer.status] || STATUS_CONFIG.pending;
    const StatusIcon = statusConfig.icon;
    const isInbound = transfer.destination_region === assignedRegion;

    return (
      <div 
        key={transfer.id}
        className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => setSelectedRequest(transfer)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{REGION_ICONS[transfer.source_region] || '📍'}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg">{REGION_ICONS[transfer.destination_region] || '📍'}</span>
              <Badge variant="outline" className={PRIORITY_COLORS[transfer.priority]}>
                {transfer.priority}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium">{transfer.total_items} items</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">{formatRelative(transfer.created_at)}</span>
            </div>
            {transfer.notes && (
              <p className="text-sm text-muted-foreground line-clamp-1">{transfer.notes}</p>
            )}
            {transfer.tracking_number && (
              <p className="text-xs font-mono text-muted-foreground">
                Tracking: {transfer.tracking_number}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={`${statusConfig.color} text-white`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusConfig.label}
            </Badge>
            {isInbound && transfer.status === 'pending' && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateStatus.mutate({ id: transfer.id, status: 'rejected' });
                  }}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateStatus.mutate({ id: transfer.id, status: 'approved' });
                  }}
                >
                  Approve
                </Button>
              </div>
            )}
            {transfer.status === 'in_transit' && isInbound && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatus.mutate({ id: transfer.id, status: 'completed' });
                }}
              >
                Mark Received
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Cross-Region Transfers
              </CardTitle>
              <CardDescription>
                Manage inventory transfers between Hawaii and Las Vegas
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={() => setShowNewDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending ({pendingTransfers.length})
              </TabsTrigger>
              <TabsTrigger value="in_transit" className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                In Transit ({inTransitTransfers.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                History ({completedTransfers.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {inboundPending.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    📥 Incoming Requests (Needs Your Approval)
                  </h3>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {inboundPending.map(renderTransferCard)}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {outboundPending.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    📤 Outgoing Requests (Awaiting Approval)
                  </h3>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {outboundPending.map(renderTransferCard)}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {pendingTransfers.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending transfer requests</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="in_transit" className="mt-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {inTransitTransfers.length > 0 ? (
                    inTransitTransfers.map(renderTransferCard)
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No transfers in transit</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="completed" className="mt-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {completedTransfers.length > 0 ? (
                    completedTransfers.map(renderTransferCard)
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No completed transfers</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <NewTransferRequestDialog 
        open={showNewDialog} 
        onOpenChange={setShowNewDialog}
        onSuccess={() => {
          refetch();
          setShowNewDialog(false);
        }}
      />

      {selectedRequest && (
        <TransferRequestDetails
          request={selectedRequest}
          open={!!selectedRequest}
          onOpenChange={(open) => !open && setSelectedRequest(null)}
          onUpdate={() => refetch()}
        />
      )}
    </>
  );
}
