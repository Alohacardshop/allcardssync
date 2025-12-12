import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Printer, AlertTriangle } from 'lucide-react';

interface PrintConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemCount: number;
  copies: number;
  onConfirm: () => void;
}

export function PrintConfirmDialog({
  open,
  onOpenChange,
  itemCount,
  copies,
  onConfirm,
}: PrintConfirmDialogProps) {
  const totalLabels = itemCount * copies;
  const estimatedMinutes = Math.ceil(totalLabels / 20); // ~20 labels per minute

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirm Large Print Job
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              You're about to print <strong>{totalLabels.toLocaleString()} labels</strong>
              {copies > 1 && ` (${itemCount} items × ${copies} copies)`}.
            </p>
            <p className="text-sm">
              Estimated time: ~{estimatedMinutes} minute{estimatedMinutes > 1 ? 's' : ''}
            </p>
            <p className="text-sm text-muted-foreground">
              Make sure your printer has enough labels loaded.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            <Printer className="h-4 w-4 mr-2" />
            Print {totalLabels.toLocaleString()} Labels
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
