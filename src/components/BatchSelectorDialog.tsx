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
  onPrintBatches: (batchIds: string[], includeAlreadyPrinted: boolean) => void;
}

export function BatchSelectorDialog({
  open,
  onOpenChange,
  storeKey,
  locationGid,
  onPrintBatches,
}: BatchSelectorDialogProps) {
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [includeAlreadyPrinted, setIncludeAlreadyPrinted] = useState(false);
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
      onPrintBatches(selectedBatchIds, includeAlreadyPrinted);
      onOpenChange(false);
      setSelectedBatchIds([]);
      setIncludeAlreadyPrinted(false);
    }
  };

  const totalUnprintedCount = selectedBatchIds.reduce((sum, batchId) => {
    const batch = batches?.find((b: any) => b.id === batchId);
    return sum + (batch?.unprinted_count || 0);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Select Batches to Print
          </DialogTitle>
          <DialogDescription>
            Select one or more batches to print labels. Use the toggle below to include already printed items if needed (e.g., after printer jams).
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
            <div className="flex flex-col gap-3 pb-2">
              <div className="flex items-center justify-between">
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
              
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                <Checkbox
                  id="include-printed"
                  checked={includeAlreadyPrinted}
                  onCheckedChange={(checked) => setIncludeAlreadyPrinted(checked as boolean)}
                />
                <label
                  htmlFor="include-printed"
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  Include already printed items (for reprinting after jams, etc.)
                </label>
              </div>
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
                {includeAlreadyPrinted 
                  ? `Print/Reprint Selected Batches`
                  : `Print ${totalUnprintedCount} Unprinted Label${totalUnprintedCount !== 1 ? 's' : ''}`
                }
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
