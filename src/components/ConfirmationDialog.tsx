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
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Trash2, Upload, Download, RefreshCw } from 'lucide-react';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive' | 'warning';
  icon?: 'warning' | 'delete' | 'upload' | 'download' | 'sync';
  loading?: boolean;
  children?: React.ReactNode;
}

const iconMap = {
  warning: AlertTriangle,
  delete: Trash2,
  upload: Upload,
  download: Download,
  sync: RefreshCw,
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = 'Continue',
  cancelText = 'Cancel',
  variant = 'default',
  icon = 'warning',
  loading = false,
  children,
}: ConfirmationDialogProps) {
  const IconComponent = iconMap[icon];
  
  const iconColors = {
    default: 'text-blue-600',
    destructive: 'text-red-600',
    warning: 'text-yellow-600',
  };

  const buttonVariants = {
    default: undefined,
    destructive: undefined,
    warning: undefined,
  } as const;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full bg-muted ${iconColors[variant]}`}>
              <IconComponent className="w-5 h-5" />
            </div>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="mt-3">
            {description}
          </AlertDialogDescription>
          {children && (
            <div className="mt-4">
              {children}
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className={variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {loading ? 'Processing...' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Pre-configured confirmation dialogs for common operations
export const DeleteConfirmationDialog = (props: Omit<ConfirmationDialogProps, 'variant' | 'icon'>) => (
  <ConfirmationDialog
    {...props}
    variant="destructive"
    icon="delete"
    confirmText={props.confirmText || 'Delete'}
  />
);

export const BulkOperationConfirmationDialog = (props: Omit<ConfirmationDialogProps, 'variant' | 'icon'>) => (
  <ConfirmationDialog
    {...props}
    variant="warning"
    icon="warning"
    confirmText={props.confirmText || 'Continue'}
  />
);

export const SyncConfirmationDialog = (props: Omit<ConfirmationDialogProps, 'variant' | 'icon'>) => (
  <ConfirmationDialog
    {...props}
    variant="default"
    icon="sync"
    confirmText={props.confirmText || 'Sync Now'}
  />
);