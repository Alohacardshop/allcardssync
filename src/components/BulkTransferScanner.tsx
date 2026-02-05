import { useState, useRef, useEffect } from "react";
 import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TransferItemsList } from "./TransferItemsList";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { Loader2, ScanBarcode, Undo2, Volume2, VolumeX } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { getLocationNameFromGid } from "@/lib/locationUtils";
import { playSuccessSound, playErrorSound, playCompletionSound, areSoundsEnabled, toggleSounds } from "@/lib/soundEffects";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLogger } from "@/hooks/useLogger";
 import { useBatchInventoryLevels } from "@/hooks/useInventoryLevels";
 import { TransferConfirmationSummary, wouldTransferGoNegative } from "@/components/TransferConfirmationSummary";
 import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
 import { RefreshCw } from "lucide-react";

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
  unique_item_uid: string;
}

interface BulkTransferScannerProps {
  onTransferComplete?: () => void;
}

const MAX_ITEMS = 100;
const WARNING_THRESHOLD = 50;
const DEBOUNCE_MS = 300;

export function BulkTransferScanner({ onTransferComplete }: BulkTransferScannerProps) {
  const logger = useLogger('BulkTransferScanner');
  const { toast } = useToast();
  const { assignedStore: storeKey, selectedLocation: locationGid, availableLocations: locations } = useStore();
  const [barcode, setBarcode] = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [sourceLocation, setSourceLocation] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);
  const [soundsEnabled, setSoundsEnabled] = useState(areSoundsEnabled());
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<number>(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to clear all
      if (e.key === 'Escape' && scannedItems.length > 0 && !isTransferring) {
        e.preventDefault();
        handleClearAll();
      }
      // Ctrl+Enter to submit transfer
      if (e.ctrlKey && e.key === 'Enter' && scannedItems.length > 0 && destinationLocation && !isTransferring) {
        e.preventDefault();
        setShowConfirmDialog(true);
      }
      // Ctrl+Z to undo
      if (e.ctrlKey && e.key === 'z' && scannedItems.length > 0 && !isTransferring) {
        e.preventDefault();
        handleUndoLast();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scannedItems, destinationLocation, isTransferring]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Debounce rapid scans
    const now = Date.now();
    if (now - lastScanRef.current < DEBOUNCE_MS) {
      return;
    }
    lastScanRef.current = now;

    if (!barcode.trim() || !destinationLocation) {
      toast({
        title: "Missing information",
        description: "Please select a destination location and enter a barcode",
        variant: "destructive",
      });
      playErrorSound();
      return;
    }

    // Check batch size limit
    if (scannedItems.length >= MAX_ITEMS) {
      toast({
        title: "Batch limit reached",
        description: `Maximum ${MAX_ITEMS} items per transfer`,
        variant: "destructive",
      });
      playErrorSound();
      return;
    }

    setIsScanning(true);

    try {
      // Search by SKU, lot_number, or unique_item_uid (parameterized to prevent SQL injection)
      const { data: items, error } = await supabase
        .from('intake_items')
        .select('*')
        .or(`sku.eq."${barcode.replace(/"/g, '""')}",lot_number.eq."${barcode.replace(/"/g, '""')}",unique_item_uid.eq."${barcode.replace(/"/g, '""')}"`)
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
        playErrorSound();
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
        playErrorSound();
        setBarcode("");
        inputRef.current?.focus();
        return;
      }

      // Check if item has location
      if (!item.shopify_location_gid) {
        toast({
          title: "Invalid item",
          description: "Item has no location assigned",
          variant: "destructive",
        });
        playErrorSound();
        setBarcode("");
        inputRef.current?.focus();
        return;
      }

      // Source location validation
      if (sourceLocation === null) {
        // First item - set source location
        setSourceLocation(item.shopify_location_gid);
      } else if (sourceLocation !== item.shopify_location_gid) {
        // Subsequent items - validate same source
        toast({
          title: "Location mismatch",
          description: `Item is at ${getLocationNameFromGid(item.shopify_location_gid, locations)}, but source is ${getLocationNameFromGid(sourceLocation, locations)}`,
          variant: "destructive",
        });
        playErrorSound();
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
        playErrorSound();
        setBarcode("");
        inputRef.current?.focus();
        return;
      }

      setScannedItems(prev => [...prev, item as ScannedItem]);
      toast({
        title: "Item added",
        description: `${item.brand_title} ${item.subject} ${item.card_number}`,
      });
      playSuccessSound();

      // Warning at threshold
      if (scannedItems.length + 1 === WARNING_THRESHOLD) {
        toast({
          title: "Approaching limit",
          description: `${WARNING_THRESHOLD} items scanned. Maximum is ${MAX_ITEMS}.`,
        });
      }

      setBarcode("");
      inputRef.current?.focus();

    } catch (error) {
      logger.logError('Scan error', error instanceof Error ? error : new Error(String(error)));
      toast({
        title: "Scan failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      playErrorSound();
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemoveItem = (id: string) => {
    setScannedItems(prev => {
      const filtered = prev.filter(item => item.id !== id);
      // Reset source location if all items removed
      if (filtered.length === 0) {
        setSourceLocation(null);
      }
      return filtered;
    });
  };

  const handleUndoLast = () => {
    if (scannedItems.length === 0) return;
    
    const lastItem = scannedItems[scannedItems.length - 1];
    setScannedItems(prev => {
      const newItems = prev.slice(0, -1);
      // Reset source location if all items removed
      if (newItems.length === 0) {
        setSourceLocation(null);
      }
      return newItems;
    });
    
    toast({
      title: "Removed",
      description: `${lastItem.brand_title} ${lastItem.subject} ${lastItem.card_number}`,
    });
  };

  const handleClearAll = () => {
    setScannedItems([]);
    setSourceLocation(null);
    setBarcode("");
    inputRef.current?.focus();
  };

  const handleConfirmTransfer = async () => {
    setShowConfirmDialog(false);
    await handleTransfer();
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

    if (!destinationLocation || !sourceLocation) {
      toast({
        title: "Missing information",
        description: "Please select a destination location",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    setTransferProgress(0);

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

      setTransferProgress(20);

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

      setTransferProgress(100);

      toast({
        title: "Transfer complete",
        description: `${data.successful} items transferred successfully${data.failed > 0 ? `, ${data.failed} failed` : ''}`,
      });
      playCompletionSound();

      setScannedItems([]);
      setSourceLocation(null);
      setBarcode("");
      setTransferProgress(0);
      inputRef.current?.focus();
      onTransferComplete?.();

    } catch (error) {
      logger.logError('Transfer error', error instanceof Error ? error : new Error(String(error)));
      toast({
        title: "Transfer failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      playErrorSound();
      setTransferProgress(0);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleToggleSounds = () => {
    const newState = toggleSounds();
    setSoundsEnabled(newState);
    toast({
      title: newState ? "Sounds enabled" : "Sounds disabled",
      description: newState ? "You'll hear feedback when scanning" : "Sound effects are now muted",
    });
  };

  const sourceName = sourceLocation ? getLocationNameFromGid(sourceLocation, locations) : null;
  const destinationName = destinationLocation ? getLocationNameFromGid(destinationLocation, locations) : null;

   // Fetch inventory levels for scanned items
   const inventoryItemIds = useMemo(
     () => scannedItems.map(item => item.shopify_inventory_item_id).filter(Boolean),
     [scannedItems]
   );
   const { data: levelsMap, isLoading: isLoadingLevels } = useBatchInventoryLevels(inventoryItemIds);
 
   // Calculate source and destination levels
   const { sourceLevels, destinationLevels } = useMemo(() => {
     const source = new Map<string, number>();
     const dest = new Map<string, number>();
     
     if (!levelsMap || !sourceLocation || !destinationLocation) {
       return { sourceLevels: source, destinationLevels: dest };
     }
     
     scannedItems.forEach(item => {
       const levels = levelsMap.get(item.shopify_inventory_item_id) || [];
       
       const sourceLevel = levels.find(l => l.location_gid === sourceLocation);
       const destLevel = levels.find(l => l.location_gid === destinationLocation);
       
       // Add to source total (use item quantity if no level found)
       source.set(item.id, sourceLevel?.available ?? item.quantity);
       dest.set(item.id, destLevel?.available ?? 0);
     });
     
     return { sourceLevels: source, destinationLevels: dest };
   }, [levelsMap, scannedItems, sourceLocation, destinationLocation]);
 
   // Check if transfer would go negative
   const transferWouldGoNegative = useMemo(() => {
     if (scannedItems.length === 0) return false;
     return wouldTransferGoNegative(sourceLevels, scannedItems.length);
   }, [sourceLevels, scannedItems.length]);
 
  return (
    <div className="space-y-6">
      {/* Source Location Display */}
      {sourceName && (
        <div className="bg-muted/50 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-muted-foreground">Source Location</Label>
              <p className="text-lg font-medium">{sourceName}</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleSounds}
                  >
                    {soundsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {soundsEnabled ? "Disable sounds" : "Enable sounds"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="destination">Destination Location</Label>
          <Select value={destinationLocation} onValueChange={setDestinationLocation}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination..." />
            </SelectTrigger>
            <SelectContent>
              {locations
                .filter(loc => loc.gid !== locationGid && loc.gid !== sourceLocation)
                .map(loc => (
                  <SelectItem key={loc.gid} value={loc.gid}>
                    {loc.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <form onSubmit={handleScan} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="barcode">Scan Barcode</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    ESC • Ctrl+Enter • Ctrl+Z
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <p>ESC: Clear all</p>
                    <p>Ctrl+Enter: Transfer</p>
                    <p>Ctrl+Z: Undo last</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or enter barcode..."
              disabled={isScanning || !destinationLocation || scannedItems.length >= MAX_ITEMS}
            />
            <Button type="submit" disabled={isScanning || !destinationLocation || scannedItems.length >= MAX_ITEMS}>
              {isScanning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanBarcode className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Transfer Progress */}
      {isTransferring && transferProgress > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Processing transfer...</span>
            <span>{transferProgress}%</span>
          </div>
          <Progress value={transferProgress} />
        </div>
      )}

      {scannedItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Scanned Items ({scannedItems.length}/{MAX_ITEMS})
            </h3>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleUndoLast} 
                disabled={isTransferring}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Undo Last
              </Button>
              <Button variant="outline" onClick={handleClearAll} disabled={isTransferring}>
                Clear All
              </Button>
              <Button onClick={() => setShowConfirmDialog(true)} disabled={isTransferring}>
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

       {/* Enhanced Confirmation Dialog with Before/After Summary */}
       <AlertDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
      >
         <AlertDialogContent className="max-w-md">
           <AlertDialogHeader>
             <div className="flex items-center gap-3">
               <div className="p-2 rounded-full bg-muted text-primary">
                 <RefreshCw className="w-5 h-5" />
               </div>
               <AlertDialogTitle>Confirm Transfer</AlertDialogTitle>
             </div>
             <AlertDialogDescription className="mt-3">
               Review the inventory changes before confirming this transfer.
             </AlertDialogDescription>
           </AlertDialogHeader>
           
           <div className="py-2">
             {isLoadingLevels ? (
               <div className="flex items-center justify-center py-4">
                 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
               </div>
             ) : sourceLocation && destinationLocation && sourceName && destinationName ? (
               <TransferConfirmationSummary
                 sourceLocationGid={sourceLocation}
                 sourceLocationName={sourceName}
                 destinationLocationGid={destinationLocation}
                 destinationLocationName={destinationName}
                 sourceLevels={sourceLevels}
                 destinationLevels={destinationLevels}
                 itemCount={scannedItems.length}
               />
             ) : null}
           </div>
 
           <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction
               onClick={handleConfirmTransfer}
               disabled={transferWouldGoNegative || isLoadingLevels}
               className={transferWouldGoNegative ? 'opacity-50 cursor-not-allowed' : undefined}
             >
               {transferWouldGoNegative ? 'Cannot Transfer' : 'Confirm Transfer'}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
    </div>
  );
}
