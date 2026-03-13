import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Trash2, Package, AlertTriangle } from 'lucide-react';

interface ActiveLotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ActiveLot {
  id: string;
  lot_number: string;
  lot_type: string;
  created_at: string;
  store_key: string | null;
  shopify_location_gid: string | null;
  item_count: number;
}

export function ActiveLotsDialog({ open, onOpenChange }: ActiveLotsDialogProps) {
  const queryClient = useQueryClient();
  const { assignedStore, selectedLocation } = useStore();
  const [closingId, setClosingId] = useState<string | null>(null);

  const { data: lots, isLoading } = useQuery({
    queryKey: ['active-lots-detail', assignedStore, selectedLocation],
    queryFn: async () => {
      // Fetch active lots filtered by store and location
      let query = supabase
        .from('intake_lots')
        .select('id, lot_number, lot_type, created_at, store_key, shopify_location_gid')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (assignedStore) {
        query = query.eq('store_key', assignedStore);
      }
      if (selectedLocation) {
        query = query.eq('shopify_location_gid', selectedLocation);
      }

      const { data: lotsData, error: lotsError } = await query;

      if (lotsError) throw lotsError;
      if (!lotsData?.length) return [];

      // Fetch ACTIVE item counts per lot (exclude sent-to-inventory and deleted)
      const lotIds = lotsData.map(l => l.id);
      const counts: Record<string, number> = {};

      for (const lotId of lotIds) {
        const { count } = await supabase
          .from('intake_items')
          .select('id', { count: 'exact', head: true })
          .eq('lot_id', lotId)
          .is('deleted_at', null)
          .is('removed_from_batch_at', null);
        counts[lotId] = count || 0;
      }

      return lotsData.map(lot => ({
        ...lot,
        item_count: counts[lot.id] || 0,
      })) as ActiveLot[];
    },
    enabled: open,
  });

  const handleCloseLot = async (lotId: string, lotNumber: string) => {
    setClosingId(lotId);
    try {
      const { error } = await supabase
        .from('intake_lots')
        .update({ status: 'closed' })
        .eq('id', lotId);

      if (error) throw error;

      toast.success(`Lot ${lotNumber} closed`);
      queryClient.invalidateQueries({ queryKey: ['active-lots-detail'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (err) {
      toast.error('Failed to close lot');
      console.error(err);
    } finally {
      setClosingId(null);
    }
  };

  // Auto-close lots with 0 active items
  const emptyLots = lots?.filter(l => l.item_count === 0) || [];
  const handleCloseAllEmpty = async () => {
    for (const lot of emptyLots) {
      await handleCloseLot(lot.id, lot.lot_number);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Active Lots</DialogTitle>
          <DialogDescription>Manage your active intake lots</DialogDescription>
        </DialogHeader>

        {emptyLots.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleCloseAllEmpty}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Close {emptyLots.length} empty lots
          </Button>
        )}

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))
          ) : !lots?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No active lots</p>
            </div>
          ) : (
            lots.map((lot) => (
              <div
                key={lot.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{lot.lot_number}</p>
                    {lot.item_count === 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        Empty
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(lot.created_at), 'MMM d, yyyy h:mm a')} · {lot.item_count} active item{lot.item_count !== 1 ? 's' : ''} · {lot.lot_type}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleCloseLot(lot.id, lot.lot_number)}
                  disabled={closingId === lot.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
