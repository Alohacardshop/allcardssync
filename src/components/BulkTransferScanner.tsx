import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransferItemsList } from "./TransferItemsList";
import { Loader2, ScanBarcode } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";

interface ScannedItem {
  id: string;
  sku: string;
  brand_title: string;
  subject: string;
  card_number: string;
  quantity: number;
  shopify_location_gid: string;
  shopify_product_id: string;
  shopify_variant_id: string;
  shopify_inventory_item_id: string;
}

interface BulkTransferScannerProps {
  onTransferComplete?: () => void;
}

export function BulkTransferScanner({ onTransferComplete }: BulkTransferScannerProps) {
  const { toast } = useToast();
  const { assignedStore: storeKey, selectedLocation: locationGid, availableLocations: locations } = useStore();
  const [barcode, setBarcode] = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim() || !destinationLocation) {
      toast({
        title: "Missing information",
        description: "Please select a destination location and enter a barcode",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);

    try {
      // Search for item by SKU or lot_number
      const { data: items, error } = await supabase
        .from('intake_items')
        .select('*')
        .or(`sku.eq.${barcode},lot_number.eq.${barcode}`)
        .is('deleted_at', null)
        .not('removed_from_batch_at', 'is', null) // Only items in inventory
        .limit(1);

      if (error) throw error;

      if (!items || items.length === 0) {
        toast({
          title: "Item not found",
          description: "No inventory item found with this barcode",
          variant: "destructive",
        });
        setBarcode("");
        inputRef.current?.focus();
        return;
      }

      const item = items[0];

      // Check if already scanned
      if (scannedItems.some(i => i.id === item.id)) {
        toast({
          title: "Already scanned",
          description: "This item is already in the list",
          variant: "destructive",
        });
        setBarcode("");
        inputRef.current?.focus();
        return;
      }

      // Check if item is at a valid source location
      if (!item.shopify_location_gid) {
        toast({
          title: "Invalid item",
          description: "Item has no location assigned",
          variant: "destructive",
        });
        setBarcode("");
        inputRef.current?.focus();
        return;
      }

      // Check if trying to transfer to same location
      if (item.shopify_location_gid === destinationLocation) {
        toast({
          title: "Invalid transfer",
          description: "Item is already at the destination location",
          variant: "destructive",
        });
        setBarcode("");
        inputRef.current?.focus();
        return;
      }

      setScannedItems(prev => [...prev, item as ScannedItem]);
      toast({
        title: "Item added",
        description: `${item.brand_title} ${item.subject} ${item.card_number}`,
      });
      setBarcode("");
      inputRef.current?.focus();

    } catch (error) {
      console.error('Scan error:', error);
      toast({
        title: "Scan failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemoveItem = (id: string) => {
    setScannedItems(prev => prev.filter(item => item.id !== id));
  };

  const handleClearAll = () => {
    setScannedItems([]);
    setBarcode("");
    inputRef.current?.focus();
  };

  const handleTransfer = async () => {
    if (scannedItems.length === 0) {
      toast({
        title: "No items",
        description: "Please scan items before transferring",
        variant: "destructive",
      });
      return;
    }

    if (!destinationLocation) {
      toast({
        title: "No destination",
        description: "Please select a destination location",
        variant: "destructive",
      });
      return;
    }

    // Get source location from first item (all should be from same source)
    const sourceLocation = scannedItems[0].shopify_location_gid;

    setIsTransferring(true);

    try {
      // Create transfer record
      const { data: transfer, error: createError } = await supabase
        .from('location_transfers')
        .insert({
          store_key: storeKey,
          source_location_gid: sourceLocation,
          destination_location_gid: destinationLocation,
          total_items: scannedItems.length,
          status: 'processing',
        })
        .select()
        .single();

      if (createError) throw createError;

      // Call edge function to process transfer
      const { data, error: transferError } = await supabase.functions.invoke('bulk-location-transfer', {
        body: {
          transfer_id: transfer.id,
          item_ids: scannedItems.map(item => item.id),
          source_location_gid: sourceLocation,
          destination_location_gid: destinationLocation,
          store_key: storeKey,
        },
      });

      if (transferError) throw transferError;

      toast({
        title: "Transfer complete",
        description: `${data.successful} items transferred successfully${data.failed > 0 ? `, ${data.failed} failed` : ''}`,
      });

      setScannedItems([]);
      setBarcode("");
      inputRef.current?.focus();
      onTransferComplete?.();

    } catch (error) {
      console.error('Transfer error:', error);
      toast({
        title: "Transfer failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="destination">Destination Location</Label>
          <Select value={destinationLocation} onValueChange={setDestinationLocation}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination..." />
            </SelectTrigger>
            <SelectContent>
              {locations
                .filter(loc => loc.gid !== locationGid) // Exclude current location
                .map(loc => (
                  <SelectItem key={loc.gid} value={loc.gid}>
                    {loc.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <form onSubmit={handleScan} className="space-y-2">
          <Label htmlFor="barcode">Scan Barcode</Label>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or enter barcode..."
              disabled={isScanning || !destinationLocation}
            />
            <Button type="submit" disabled={isScanning || !destinationLocation}>
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanBarcode className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>

      {scannedItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Scanned Items ({scannedItems.length})
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClearAll} disabled={isTransferring}>
                Clear All
              </Button>
              <Button onClick={handleTransfer} disabled={isTransferring}>
                {isTransferring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  `Transfer ${scannedItems.length} Items`
                )}
              </Button>
            </div>
          </div>

          <TransferItemsList items={scannedItems} onRemove={handleRemoveItem} />
        </div>
      )}
    </div>
  );
}
