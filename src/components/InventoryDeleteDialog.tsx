import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";

interface InventoryDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  items: InventoryItem[];
  loading?: boolean;
}

export function InventoryDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  items,
  loading = false
}: InventoryDeleteDialogProps) {
  if (items.length === 0) {
    return (
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              No Items Selected
            </AlertDialogTitle>
            <AlertDialogDescription>
              Please select items to delete before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onClose}>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const syncedItems = items.filter(item => 
    item.shopify_product_id && item.shopify_sync_status === 'synced'
  );
  const inventoryOnlyItems = items.filter(item => 
    !item.shopify_product_id || item.shopify_sync_status !== 'synced'
  );

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete {items.length} Item{items.length > 1 ? 's' : ''} from Inventory
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            You are about to permanently delete {items.length} item{items.length > 1 ? 's' : ''} from inventory.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {syncedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">
                  {syncedItems.length} item{syncedItems.length > 1 ? 's' : ''} will be removed from Shopify AND deleted from inventory
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground pl-4">
                These items are currently synced to Shopify and will be automatically removed from your store before being deleted from inventory.
              </div>
            </div>
          )}

          {inventoryOnlyItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {inventoryOnlyItems.length} item{inventoryOnlyItems.length > 1 ? 's' : ''} will be deleted from inventory only
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground pl-4">
                These items are not synced to Shopify and will only be deleted from your inventory.
              </div>
            </div>
          )}

          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-destructive mb-1">Warning: This action is permanent</div>
                <div className="text-muted-foreground">
                  Deleted items will be marked as deleted but remain in the database for audit purposes. 
                  They will not appear in normal inventory views.
                </div>
              </div>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete ${items.length} Item${items.length > 1 ? 's' : ''}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}