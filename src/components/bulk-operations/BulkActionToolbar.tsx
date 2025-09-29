import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  Edit, 
  Trash2, 
  Download, 
  Upload, 
  Archive, 
  Package, 
  Printer, 
  Copy,
  Tag,
  X,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'sonner';

interface BulkOperation {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  requiresConfirmation?: boolean;
  confirmationTitle?: string;
  confirmationDescription?: string;
}

interface BulkActionToolbarProps {
  selectedItems: Set<string>;
  totalItems: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkAction: (action: string, itemIds: string[]) => Promise<void>;
  operations?: BulkOperation[];
  className?: string;
}

const defaultOperations: BulkOperation[] = [
  {
    id: 'edit',
    label: 'Edit',
    icon: Edit,
    variant: 'outline'
  },
  {
    id: 'archive',
    label: 'Archive',
    icon: Archive,
    variant: 'outline'
  },
  {
    id: 'print-labels',
    label: 'Print Labels',
    icon: Printer,
    variant: 'outline'
  },
  {
    id: 'add-to-batch',
    label: 'Add to Batch',
    icon: Package,
    variant: 'outline'
  },
  {
    id: 'tag',
    label: 'Add Tags',
    icon: Tag,
    variant: 'outline'
  },
  {
    id: 'export',
    label: 'Export',
    icon: Download,
    variant: 'outline'
  },
  {
    id: 'duplicate',
    label: 'Duplicate',
    icon: Copy,
    variant: 'outline'
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    variant: 'destructive',
    requiresConfirmation: true,
    confirmationTitle: 'Delete Items',
    confirmationDescription: 'Are you sure you want to delete the selected items? This action cannot be undone.'
  }
];

export function BulkActionToolbar({
  selectedItems,
  totalItems,
  onSelectAll,
  onClearSelection,
  onBulkAction,
  operations = defaultOperations,
  className = ''
}: BulkActionToolbarProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingAction, setProcessingAction] = useState<string>('');
  const [confirmAction, setConfirmAction] = useState<BulkOperation | null>(null);

  const selectedCount = selectedItems.size;
  const isAllSelected = selectedCount === totalItems && totalItems > 0;
  const hasSelection = selectedCount > 0;

  const handleSelectAll = () => {
    if (isAllSelected) {
      onClearSelection();
    } else {
      onSelectAll();
    }
  };

  const handleBulkAction = async (operation: BulkOperation) => {
    if (operation.requiresConfirmation) {
      setConfirmAction(operation);
      return;
    }

    await executeBulkAction(operation);
  };

  const executeBulkAction = async (operation: BulkOperation) => {
    setIsProcessing(true);
    setProcessingAction(operation.label);
    setProcessingProgress(0);

    try {
      const itemIds = Array.from(selectedItems);
      
      await onBulkAction(operation.id, itemIds);
      
      toast.success(`${operation.label} completed for ${selectedCount} items`);
      
      // Clear selection after successful operation
      onClearSelection();
      
    } catch (error) {
      toast.error(`Failed to ${operation.label.toLowerCase()} items`);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingProgress(0);
        setProcessingAction('');
      }, 500);
    }
  };

  const confirmBulkAction = async () => {
    if (confirmAction) {
      await executeBulkAction(confirmAction);
      setConfirmAction(null);
    }
  };

  if (!hasSelection && !isProcessing) {
    return null;
  }

  return (
    <>
      <Card className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 shadow-lg border-2 ${className}`}>
        <div className="flex items-center p-4 space-x-4">
          {/* Selection controls */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-8 w-8 p-0"
            >
              {isAllSelected ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>
            <div className="text-sm font-medium">
              {selectedCount} of {totalItems} selected
            </div>
            <Badge variant="secondary">{selectedCount}</Badge>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Action buttons */}
          {isProcessing ? (
            <div className="flex items-center space-x-3">
              <div className="text-sm font-medium">{processingAction}...</div>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              {operations.map((operation) => (
                <Button
                  key={operation.id}
                  variant={operation.variant || 'outline'}
                  size="sm"
                  onClick={() => handleBulkAction(operation)}
                  className="h-8"
                  disabled={isProcessing}
                >
                  <operation.icon className="h-3 w-3 mr-1" />
                  {operation.label}
                </Button>
              ))}
            </div>
          )}

          <Separator orientation="vertical" className="h-6" />

          {/* Clear selection */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 w-8 p-0"
            disabled={isProcessing}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.confirmationTitle || `Confirm ${confirmAction?.label}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.confirmationDescription || 
               `Are you sure you want to ${confirmAction?.label.toLowerCase()} ${selectedCount} selected items?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              className={confirmAction?.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {confirmAction?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}