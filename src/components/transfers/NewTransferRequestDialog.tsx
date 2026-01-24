import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Plus, X, Scan, Package } from 'lucide-react';

interface NewTransferRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface TransferItem {
  sku: string;
  item_name: string;
  quantity: number;
  intake_item_id?: string;
}

const REGIONS = [
  { value: 'hawaii', label: 'Hawaii', icon: '🌺' },
  { value: 'las_vegas', label: 'Las Vegas', icon: '🎰' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', description: 'No rush' },
  { value: 'normal', label: 'Normal', description: 'Standard shipping' },
  { value: 'high', label: 'High', description: 'Priority shipping' },
  { value: 'urgent', label: 'Urgent', description: 'Next-day if possible' },
];

export function NewTransferRequestDialog({ open, onOpenChange, onSuccess }: NewTransferRequestDialogProps) {
  const { assignedRegion } = useStore();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [destinationRegion, setDestinationRegion] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  const [skuInput, setSkuInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  // Set default destination to the other region
  const sourceRegion = assignedRegion || 'hawaii';
  const otherRegion = sourceRegion === 'hawaii' ? 'las_vegas' : 'hawaii';

  const lookupSku = async (sku: string) => {
    const { data, error } = await supabase
      .from('intake_items')
      .select('id, sku, subject, brand_title, quantity')
      .eq('sku', sku)
      .eq('store_key', sourceRegion)
      .single();
    
    if (error || !data) {
      toast.error(`Item not found: ${sku}`);
      return null;
    }
    
    // Build item name from available fields
    const itemName = data.subject || data.brand_title || 'Unknown Item';
    
    return {
      sku: data.sku || sku,
      item_name: itemName,
      quantity: 1,
      intake_item_id: data.id,
    };
  };

  const addItem = async () => {
    if (!skuInput.trim()) return;
    
    setIsScanning(true);
    const item = await lookupSku(skuInput.trim());
    setIsScanning(false);
    
    if (item) {
      // Check if already added
      const existing = items.find(i => i.sku === item.sku);
      if (existing) {
        setItems(items.map(i => 
          i.sku === item.sku ? { ...i, quantity: i.quantity + 1 } : i
        ));
      } else {
        setItems([...items, item]);
      }
      setSkuInput('');
    }
  };

  const removeItem = (sku: string) => {
    setItems(items.filter(i => i.sku !== sku));
  };

  const updateQuantity = (sku: string, quantity: number) => {
    if (quantity < 1) return;
    setItems(items.map(i => 
      i.sku === sku ? { ...i, quantity } : i
    ));
  };

  const createRequest = useMutation({
    mutationFn: async () => {
      // Create the transfer request
      const { data: request, error: requestError } = await supabase
        .from('cross_region_transfer_requests')
        .insert({
          source_region: sourceRegion,
          destination_region: destinationRegion || otherRegion,
          priority,
          notes: notes || null,
          created_by: user?.id,
          total_items: items.reduce((sum, i) => sum + i.quantity, 0),
        })
        .select()
        .single();
      
      if (requestError) throw requestError;
      
      // Add items to the request
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('cross_region_transfer_items')
          .insert(items.map(item => ({
            request_id: request.id,
            intake_item_id: item.intake_item_id || null,
            sku: item.sku,
            item_name: item.item_name,
            quantity: item.quantity,
          })));
        
        if (itemsError) throw itemsError;
      }
      
      return request;
    },
    onSuccess: () => {
      toast.success('Transfer request created');
      queryClient.invalidateQueries({ queryKey: ['cross-region-transfers'] });
      resetForm();
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(`Failed to create request: ${error.message}`);
    },
  });

  const resetForm = () => {
    setDestinationRegion('');
    setPriority('normal');
    setNotes('');
    setItems([]);
    setSkuInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Transfer Request</DialogTitle>
          <DialogDescription>
            Request items to be transferred from {REGIONS.find(r => r.value === sourceRegion)?.icon} {REGIONS.find(r => r.value === sourceRegion)?.label} to another location
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination */}
          <div className="space-y-2">
            <Label>Destination</Label>
            <Select value={destinationRegion || otherRegion} onValueChange={setDestinationRegion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.filter(r => r.value !== sourceRegion).map(region => (
                  <SelectItem key={region.value} value={region.value}>
                    <span className="flex items-center gap-2">
                      <span>{region.icon}</span>
                      <span>{region.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className="flex items-center justify-between w-full">
                      <span>{p.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{p.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add Items */}
          <div className="space-y-2">
            <Label>Items</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Scan or enter SKU..."
                  value={skuInput}
                  onChange={(e) => setSkuInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10"
                />
              </div>
              <Button onClick={addItem} disabled={isScanning || !skuInput.trim()}>
                {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Items List */}
          {items.length > 0 && (
            <ScrollArea className="h-[200px] border rounded-lg p-2">
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.sku} className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.sku, parseInt(e.target.value) || 1)}
                        className="w-16 h-8 text-center"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.sku)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {items.length === 0 && (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No items added yet</p>
              <p className="text-xs">Scan barcodes or enter SKUs to add items</p>
            </div>
          )}

          {/* Total */}
          {items.length > 0 && (
            <div className="flex justify-between items-center p-2 bg-muted rounded-lg">
              <span className="text-sm font-medium">Total Items:</span>
              <Badge variant="secondary">
                {items.reduce((sum, i) => sum + i.quantity, 0)} items
              </Badge>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Add any notes about this transfer..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => createRequest.mutate()}
            disabled={createRequest.isPending || items.length === 0}
          >
            {createRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
