import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useBatchesList } from '@/hooks/useBatchesList';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Package, Printer } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BatchSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeKey: string;
  locationGid: string;
  onPrintBatches: (batchIds: string[]) => void;
}

export function BatchSelectorDialog({
  open,
  onOpenChange,
  storeKey,
  locationGid,
  onPrintBatches,
}: BatchSelectorDialogProps) {
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const { data: batches, isLoading } = useBatchesList({ storeKey, locationGid });

  const handleToggleBatch = (batchId: string) => {
    setSelectedBatchIds(prev =>
      prev.includes(batchId)
        ? prev.filter(id => id !== batchId)
        : [...prev, batchId]
    );
  };

  const handleSelectAll = () => {
    if (selectedBatchIds.length === batches?.length) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(batches?.map(b => b.id) || []);
    }
  };

  const handlePrint = () => {
    if (selectedBatchIds.length > 0) {
      onPrintBatches(selectedBatchIds);
      onOpenChange(false);
      setSelectedBatchIds([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Select Batches to Print
          </DialogTitle>
          <DialogDescription>
            Select one or more batches to print all unprinted labels from them
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !batches || batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No batches found</p>
          </div>
        ) : batches.every((b: any) => (b.unprinted_count || 0) === 0) ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No batches with unprinted items</p>
            <p className="text-xs text-muted-foreground mt-1">All items in these batches have been printed or deleted</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedBatchIds.length === batches.length ? 'Deselect All' : 'Select All'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedBatchIds.length} of {batches.length} selected
              </span>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => handleToggleBatch(batch.id)}
                  >
                    <Checkbox
                      checked={selectedBatchIds.includes(batch.id)}
                      onCheckedChange={() => handleToggleBatch(batch.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                     <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-mono font-semibold">
                          {batch.lot_number}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(batch.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className={
                          (batch as any).unprinted_count > 0 
                            ? "text-foreground font-medium" 
                            : "text-muted-foreground"
                        }>
                          {(batch as any).unprinted_count || 0} unprinted
                        </span>
                        <span className="text-muted-foreground">
                          {batch.total_items || 0} total
                        </span>
                        {batch.total_value && (
                          <span className="text-muted-foreground">${(batch.total_value as number).toFixed(2)}</span>
                        )}
                        {batch.status && (
                          <span className="text-muted-foreground capitalize">{batch.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePrint}
                disabled={selectedBatchIds.length === 0}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print {selectedBatchIds.length > 0 
                  ? `${batches?.filter((b: any) => selectedBatchIds.includes(b.id)).reduce((sum: number, b: any) => sum + (b.unprinted_count || 0), 0)} Labels` 
                  : 'Labels'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
