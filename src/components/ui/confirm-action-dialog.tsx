import React, { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** If provided, user must type this exact word to confirm */
  requireTypedConfirmation?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  loading?: boolean;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  requireTypedConfirmation,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
}: ConfirmActionDialogProps) {
  const [typedValue, setTypedValue] = useState('');

  const canConfirm = requireTypedConfirmation
    ? typedValue.toUpperCase() === requireTypedConfirmation.toUpperCase()
    : true;

  const handleConfirm = () => {
    if (canConfirm && !loading) {
      setTypedValue('');
      onConfirm();
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTypedValue('');
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${variant === 'destructive' ? 'text-destructive' : 'text-orange-500'}`} />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireTypedConfirmation && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">
              Type <span className="font-mono font-bold">{requireTypedConfirmation}</span> to confirm:
            </p>
            <Input
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={requireTypedConfirmation}
              className="font-mono"
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className={variant === 'destructive' ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}
          >
            {loading ? 'Processing...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
