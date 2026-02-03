import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Loader2, Printer, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { printQueue } from '@/lib/print/queueInstance';
import { zplFromTemplateString } from '@/lib/labels/zpl';
import { toast } from 'sonner';

interface PrintFromInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedItems: any[];
  onPrintComplete?: () => void;
}

interface LabelTemplate {
  id: string;
  name: string;
  canvas: any;
  data?: any;
  is_default?: boolean;
}

export function PrintFromInventoryDialog({
  open,
  onOpenChange,
  selectedItems,
  onPrintComplete
}: PrintFromInventoryDialogProps) {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [copies, setCopies] = useState(1);
  const [markAsPrinted, setMarkAsPrinted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState(0);
  const [printedCount, setPrintedCount] = useState(0);

  // Load templates on mount
  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('label_templates')
          .select('*')
          .eq('template_type', 'raw')
          .order('is_default', { ascending: false })
          .order('name');

        if (error) throw error;
        
        const templatesData = (data || []) as LabelTemplate[];
        setTemplates(templatesData);
        
        // Select default template
        const defaultTemplate = templatesData.find(t => t.is_default);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        } else if (templatesData.length > 0) {
          setSelectedTemplateId(templatesData[0].id);
        }
      } catch (error) {
        console.error('Failed to load templates:', error);
        toast.error('Failed to load label templates');
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadTemplates();
      setPrintProgress(0);
      setPrintedCount(0);
    }
  }, [open]);

  const handlePrint = useCallback(async () => {
    if (!selectedTemplateId || selectedItems.length === 0) {
      toast.error('Please select a template and ensure items are selected');
      return;
    }

    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) {
      toast.error('Template not found');
      return;
    }

    // Extract ZPL body from template
    const zplBody = template.data?.zpl || template.canvas?.zpl;
    if (!zplBody) {
      toast.error('Template has no ZPL data');
      return;
    }

    setPrinting(true);
    setPrintProgress(0);
    setPrintedCount(0);

    const itemsToPrint = selectedItems;
    const total = itemsToPrint.length;
    let printed = 0;
    let failed = 0;

    try {
      for (const item of itemsToPrint) {
        try {
          // Map item data to template variables
          const vars = {
            CARDNAME: item.subject || item.brand_title || 'Unknown',
            SETNAME: item.brand_title || '',
            CARDNUMBER: item.card_number || '',
            CONDITION: item.grade || item.variant || 'NM',
            PRICE: item.price ? `$${Number(item.price).toFixed(2)}` : '',
            SKU: item.sku || '',
            BARCODE: item.sku || item.id,
            VENDOR: item.vendor || '',
            YEAR: item.year || '',
            CATEGORY: item.category || item.main_category || '',
          };

          const zpl = zplFromTemplateString(zplBody, vars);
          await printQueue.enqueueSafe({ zpl, qty: copies, usePQ: true });
          
          printed++;
          setPrintedCount(printed);
          setPrintProgress((printed / total) * 100);
        } catch (itemError) {
          console.error(`Failed to print item ${item.sku}:`, itemError);
          failed++;
        }
      }

      // Mark items as printed if enabled
      if (markAsPrinted && printed > 0) {
        const printedIds = itemsToPrint.slice(0, printed).map(i => i.id);
        const { error: updateError } = await supabase
          .from('intake_items')
          .update({ printed_at: new Date().toISOString() })
          .in('id', printedIds);

        if (updateError) {
          console.error('Failed to mark items as printed:', updateError);
          toast.warning('Items printed but failed to update print status');
        }
      }

      if (failed === 0) {
        toast.success(`Successfully queued ${printed} items for printing (${copies} copies each)`);
      } else {
        toast.warning(`Printed ${printed} items, ${failed} failed`);
      }

      onPrintComplete?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Print job failed:', error);
      toast.error('Print job failed: ' + (error as Error).message);
    } finally {
      setPrinting(false);
    }
  }, [selectedTemplateId, selectedItems, templates, copies, markAsPrinted, onPrintComplete, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Barcodes
          </DialogTitle>
          <DialogDescription>
            Print barcode labels for {selectedItems.length} selected item{selectedItems.length !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No label templates found.</p>
            <p className="text-sm text-muted-foreground">Create a template in Label Studio first.</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template">Label Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} {template.is_default && '(Default)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="copies">Copies per Item</Label>
              <Input
                id="copies"
                type="number"
                min={1}
                max={10}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="markPrinted"
                checked={markAsPrinted}
                onCheckedChange={(checked) => setMarkAsPrinted(checked as boolean)}
              />
              <Label htmlFor="markPrinted" className="text-sm font-normal cursor-pointer">
                Mark items as printed after successful print
              </Label>
            </div>

            {printing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Printing...</span>
                  <span>{printedCount} / {selectedItems.length}</span>
                </div>
                <Progress value={printProgress} />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={printing}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={loading || printing || templates.length === 0 || !selectedTemplateId}
          >
            {printing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Printing...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                Print {selectedItems.length} Label{selectedItems.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
