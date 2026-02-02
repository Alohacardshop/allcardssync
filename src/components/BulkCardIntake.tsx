import React, { useState, useEffect } from 'react';
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
import { SubCategoryCombobox } from '@/components/ui/sub-category-combobox';
import { detectMainCategory } from '@/utils/categoryMapping';
import { useLogger } from '@/hooks/useLogger';
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";


interface BulkCardIntakeProps {
  onBatchAdd?: (item: any) => void;
}

const GAME_OPTIONS = [
  { value: 'pokemon', label: 'Pokemon' },
  { value: 'magic-the-gathering', label: 'Magic the Gathering' }
];

export function BulkCardIntake({ onBatchAdd }: BulkCardIntakeProps) {
  const logger = useLogger('BulkCardIntake');
  const { assignedStore, selectedLocation } = useStore();
  const { mutateAsync: addItem, isPending: isAdding } = useAddIntakeItem();
  
  // Form state
  const [selectedGame, setSelectedGame] = useState('');
  const [amount, setAmount] = useState(1);
  const [totalPrice, setTotalPrice] = useState(0);
  const [addingBulk, setAddingBulk] = useState(false);
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);
  const [mainCategory, setMainCategory] = useState('tcg');
  const [subCategory, setSubCategory] = useState('');
  

  // Auto-detect main category when game changes
  React.useEffect(() => {
    if (selectedGame) {
      const detected = detectMainCategory(selectedGame);
      setMainCategory(detected);
    }
  }, [selectedGame]);

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
        logger.logError('Access check error', new Error(debugError.message));
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
      logger.logError('Preflight check error', error);
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
      
      const result = await addItem({
        store_key_in: assignedStore!.trim(),
        shopify_location_gid_in: selectedLocation!.trim(),
        quantity_in: amount,
        brand_title_in: gameTitle,
        subject_in: 'Bulk Cards',
        category_in: subCategory || 'Card Bulk',
        variant_in: 'Bulk',
        card_number_in: '',
        grade_in: '',
        price_in: totalPrice,
        cost_in: totalPrice,
        sku_in: `${selectedGame.toUpperCase()}-BULK-${Date.now()}`,
        source_provider_in: 'bulk_entry',
        main_category_in: mainCategory,
        sub_category_in: subCategory,
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
      });


      if (onBatchAdd) {
        onBatchAdd(result);
      }

      // Reset form
      setSelectedGame('');
      setAmount(1);
      setTotalPrice(0);
      setSubCategory('');
    } catch (error: any) {
      logger.logError('Bulk add error', error);
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
          <div>
            <Label htmlFor="mainCategory">Main Category</Label>
            <Select value={mainCategory} onValueChange={setMainCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tcg">🎴 TCG</SelectItem>
                <SelectItem value="comics">📚 Comics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="subCategory">Sub-Category</Label>
            <SubCategoryCombobox
              mainCategory={mainCategory}
              value={subCategory}
              onChange={(value, mainCategoryId) => {
                setSubCategory(value);
                if (mainCategoryId) {
                  setMainCategory(mainCategoryId);
                }
              }}
            />
          </div>

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
            disabled={addingBulk || !selectedGame || !assignedStore || !selectedLocation || amount <= 0 || totalPrice <= 0 || accessCheckLoading || !subCategory}
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