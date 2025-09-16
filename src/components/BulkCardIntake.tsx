import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Package, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';
import { OtherItemsEntry } from '@/components/OtherItemsEntry';
import { validateCompleteStoreContext, logStoreContext } from '@/utils/storeValidation';
interface BulkCardIntakeProps {
  onBatchAdd?: (item: any) => void;
}

const GAME_OPTIONS = [
  { value: 'pokemon', label: 'Pokemon' },
  { value: 'magic-the-gathering', label: 'Magic the Gathering' }
];

export function BulkCardIntake({ onBatchAdd }: BulkCardIntakeProps) {
  const { assignedStore, selectedLocation } = useStore();
  
  // Form state
  const [selectedGame, setSelectedGame] = useState('');
  const [amount, setAmount] = useState(1);
  const [totalPrice, setTotalPrice] = useState(0);
  const [addingBulk, setAddingBulk] = useState(false);
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);

  // Access check function
  const checkAccessAndShowToast = async (): Promise<boolean> => {
    setAccessCheckLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("No user session found");
        return false;
      }

      if (!assignedStore || !selectedLocation) {
        toast.error("Store and location must be selected");
        return false;
      }

      const userId = session.user.id;
      const userIdLast6 = userId.slice(-6);
      const storeKeyTrimmed = assignedStore.trim();
      const locationGidTrimmed = selectedLocation.trim();

      // Use the diagnostic RPC for access check
      const { data: debugResult, error: debugError } = await supabase.rpc('debug_eval_intake_access', {
        _user_id: userId,
        _store_key: storeKeyTrimmed,
        _location_gid: locationGidTrimmed
      });

      if (debugError) {
        console.error('Access check error:', debugError);
        toast.error(`Access check failed: ${debugError.message}`);
        return false;
      }

      const result = debugResult as {
        user_id: string;
        store_key: string;
        location_gid: string;
        has_staff: boolean;
        can_access_location: boolean;
      };

      // Show diagnostic toast
      toast.info(`Access Check: User ${userIdLast6} | Store: ${result.store_key} | Location: ${result.location_gid} | hasStaff: ${result.has_staff} | canAccessLocation: ${result.can_access_location}`, {
        duration: 5000
      });

      if (!result.can_access_location) {
        toast.error(`Access denied — you're not assigned to this store/location (${result.store_key}, ${result.location_gid}).`);
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('Preflight check error:', error);
      toast.error(`Preflight check failed: ${error.message}`);
      return false;
    } finally {
      setAccessCheckLoading(false);
    }
  };

  // Add bulk item to batch
  const handleAddBulkToBatch = async () => {
    try {
      // Validate store context before submission
      const storeContext = validateCompleteStoreContext(
        { assignedStore, selectedLocation }, 
        'add bulk cards to batch'
      );
      
      logStoreContext('BulkCardIntake', storeContext, { 
        game: selectedGame,
        amount: amount,
        totalPrice: totalPrice 
      });
    } catch (error: any) {
      toast.error(error.message);
      return;
    }

    if (!selectedGame) {
      toast.error('Please select a game');
      return;
    }
    
    if (amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    if (totalPrice <= 0) {
      toast.error('Please enter a valid total price');
      return;
    }

    // Check access
    const hasAccess = await checkAccessAndShowToast();
    if (!hasAccess) {
      return;
    }

    setAddingBulk(true);

    try {
      const gameTitle = `${selectedGame.charAt(0).toUpperCase() + selectedGame.slice(1)} Bulk Cards`;
      
      const rpcParams = {
        store_key_in: assignedStore!.trim(),
        shopify_location_gid_in: selectedLocation!.trim(),
        quantity_in: amount,
        brand_title_in: gameTitle,
        subject_in: 'Bulk Cards',
        category_in: 'Card Bulk',
        variant_in: 'Bulk',
        card_number_in: '',
        grade_in: '',
        price_in: totalPrice,
        cost_in: totalPrice, // Use same amount for cost
        sku_in: `${selectedGame.toUpperCase()}-BULK-${Date.now()}`,
        source_provider_in: 'bulk_entry',
        catalog_snapshot_in: {
          name: gameTitle,
          game: selectedGame,
          type: 'card_bulk'
        },
        pricing_snapshot_in: {
          total_price: totalPrice,
          amount: amount,
          price_per_item: totalPrice / amount,
          captured_at: new Date().toISOString()
        },
        processing_notes_in: `Bulk card entry: ${amount} ${selectedGame} cards at $${totalPrice.toFixed(2)} total ($${(totalPrice / amount).toFixed(2)} each)`
      };

      const response = await supabase.rpc('create_raw_intake_item', rpcParams);

      if (response.error) {
        console.error('Bulk add error:', response.error);
        toast.error(`Failed to add bulk item: ${response.error.message}`);
      } else {
        toast.success(`Successfully added ${amount} ${selectedGame} bulk cards to batch ($${totalPrice.toFixed(2)} total)`);
        
        // Dispatch browser event for real-time updates
        const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
        window.dispatchEvent(new CustomEvent('intake:item-added', { 
          detail: { ...responseData, lot_number: responseData?.lot_number }
        }));

        if (onBatchAdd) {
          onBatchAdd(responseData);
        }

        // Reset form
        setSelectedGame('');
        setAmount(1);
        setTotalPrice(0);
      }
    } catch (error: any) {
      console.error('Bulk add error:', error);
      toast.error(`Failed to add bulk item: ${error.message}`);
    } finally {
      setAddingBulk(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Access Alert */}
      {(!assignedStore || !selectedLocation) && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            Please select both a store and location above to add bulk cards to your batch.
          </AlertDescription>
        </Alert>
      )}

      {/* Bulk Card Entry Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bulk Card Entry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Game Selector */}
            <div>
              <Label htmlFor="game">Game</Label>
              <Select value={selectedGame} onValueChange={setSelectedGame}>
                <SelectTrigger>
                  <SelectValue placeholder="Select game" />
                </SelectTrigger>
                <SelectContent>
                  {GAME_OPTIONS.map((game) => (
                    <SelectItem key={game.value} value={game.value}>
                      {game.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value) || 1)}
                placeholder="Enter amount"
              />
            </div>

            {/* Total Price */}
            <div>
              <Label htmlFor="totalPrice">Total Price ($)</Label>
              <Input
                id="totalPrice"
                type="number"
                min="0"
                step="0.01"
                value={totalPrice}
                onChange={(e) => setTotalPrice(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Price per item display */}
          {amount > 0 && totalPrice > 0 && (
            <div className="text-sm text-muted-foreground">
              Price per item: ${(totalPrice / amount).toFixed(2)}
            </div>
          )}

          {/* Add to Batch Button */}
          <Button
            onClick={handleAddBulkToBatch}
            disabled={addingBulk || !selectedGame || !assignedStore || !selectedLocation || amount <= 0 || totalPrice <= 0 || accessCheckLoading}
            className="w-full"
          >
            {addingBulk || accessCheckLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {accessCheckLoading ? 'Checking Access...' : 'Adding to Batch...'}
              </>
            ) : (
              <>
                <Package className="mr-2 h-4 w-4" />
                Add to Batch
              </>
            )}
          </Button>

          <div className="text-xs text-muted-foreground">
            💡 Bulk cards are added to batch and inventory but will not sync to Shopify or print barcode labels
          </div>
        </CardContent>
      </Card>

      {/* Other Items Entry Form */}
      <OtherItemsEntry onBatchAdd={onBatchAdd} />
    </div>
  );
}