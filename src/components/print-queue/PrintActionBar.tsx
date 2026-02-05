import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Printer, Loader2, Wrench, ChevronDown, RotateCcw } from 'lucide-react';
import { PrinterStatusBadge } from './PrinterStatusBadge';

interface Template {
  id: string;
  name: string;
  is_default: boolean;
}

interface PrintActionBarProps {
  selectedCount: number;
  templates: Template[];
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
  copies: number;
  onCopiesChange: (copies: number) => void;
  isPrinting: boolean;
  onPrint: () => void;
  onClearSelection: () => void;
  // Print options
  markAsPrinted: boolean;
  onMarkAsPrintedChange: (value: boolean) => void;
  showMarkUnprinted: boolean;
  isMarkingUnprinted: boolean;
  onMarkUnprinted: () => void;
}

export function PrintActionBar({
  selectedCount,
  templates,
  selectedTemplateId,
  onTemplateChange,
  copies,
  onCopiesChange,
  isPrinting,
  onPrint,
  onClearSelection,
  markAsPrinted,
  onMarkAsPrintedChange,
  showMarkUnprinted,
  isMarkingUnprinted,
  onMarkUnprinted,
}: PrintActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50">
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Template & Copies */}
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label htmlFor="template" className="text-xs">Template</Label>
              <Select value={selectedTemplateId} onValueChange={onTemplateChange}>
                <SelectTrigger id="template" className="w-[200px]">
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} {template.is_default && '(default)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="copies" className="text-xs">Copies</Label>
              <Input
                id="copies"
                type="number"
                min={1}
                max={10}
                value={copies}
                onChange={(e) => onCopiesChange(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20"
              />
            </div>
          </div>

          {/* Center - Status */}
          <div className="flex items-center gap-3">
            <PrinterStatusBadge />
            <span className="text-sm text-muted-foreground">
              {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
            </span>
            <Button 
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              Clear Selection
            </Button>
          </div>
          
          {/* Right side - Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={onPrint}
              disabled={isPrinting || !selectedTemplateId}
              size="lg"
            >
              {isPrinting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Printer className="h-4 w-4 mr-2" />
              )}
              Print Selected ({selectedCount})
            </Button>
            
            {/* Print Options */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Wrench className="h-4 w-4" />
                  Options
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-3" align="end" side="top">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="mark-printed-toggle" className="text-xs">Mark as printed</Label>
                    <Switch
                      id="mark-printed-toggle"
                      checked={markAsPrinted}
                      onCheckedChange={onMarkAsPrintedChange}
                    />
                  </div>
                  {showMarkUnprinted && (
                    <Button 
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={onMarkUnprinted}
                      disabled={isMarkingUnprinted}
                    >
                      {isMarkingUnprinted ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Mark Unprinted
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
}
