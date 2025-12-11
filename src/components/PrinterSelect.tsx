/**
 * PrinterSelect - Reusable printer selection dropdown
 * Works with QZ Tray to list available printers
 */

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw, Printer, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PrinterSelectProps {
  value: string;
  onChange: (printerName: string) => void;
  printers: string[];
  isLoading?: boolean;
  onRefresh?: () => void;
  disabled?: boolean;
  filterZebra?: boolean;
  zebraPrinters?: string[];
  placeholder?: string;
  className?: string;
  showRefreshButton?: boolean;
}

export function PrinterSelect({
  value,
  onChange,
  printers,
  isLoading = false,
  onRefresh,
  disabled = false,
  filterZebra = false,
  zebraPrinters = [],
  placeholder = 'Select printer...',
  className,
  showRefreshButton = true,
}: PrinterSelectProps) {
  const displayPrinters = filterZebra ? zebraPrinters : printers;
  const hasPrinters = displayPrinters.length > 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="flex-1 bg-background">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder={isLoading ? 'Loading printers...' : placeholder} />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {!hasPrinters ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>No printers found</span>
            </div>
          ) : (
            displayPrinters.map((printer) => (
              <SelectItem key={printer} value={printer}>
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  <span>{printer}</span>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {showRefreshButton && onRefresh && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={disabled || isLoading}
          title="Refresh printer list"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      )}
    </div>
  );
}
