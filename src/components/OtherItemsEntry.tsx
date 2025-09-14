import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';

interface OtherItemsEntryProps {
  onBatchAdd?: (item: any) => void;
}

export function OtherItemsEntry({ onBatchAdd }: OtherItemsEntryProps) {
  const { assignedStore, selectedLocation } = useStore();
  
  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(1);
  const [totalPrice, setTotalPrice] = useState(0);
  const [addingOther, setAddingOther] = useState(false);
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);

  // Access check function (reused from BulkCardIntake)
  const checkAccessAndShowToast = async (): Promise<boolean> => {
    setAccessCheckLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("No user session found");
        return false;
      }

      if (!selectedStore || !selectedLocation) {
        toast.error("Store and location must be selected");
        return false;
      }

      const userId = session.user.id;
      const userIdLast6 = userId.slice(-6);
      const storeKeyTrimmed = selectedStore.trim();
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

  // Add other item to batch
  const handleAddOtherToBatch = async () => {
    if (!description.trim()) {
      toast.error('Please enter a description');
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

    setAddingOther(true);

    try {
      const rpcParams = {
        store_key_in: selectedStore!.trim(),
        shopify_location_gid_in: selectedLocation!.trim(),
        quantity_in: amount,
        brand_title_in: 'Other Items',
        subject_in: description.trim(),
        category_in: 'Other Items',
        variant_in: 'Other',
        card_number_in: '',
        grade_in: '',
        price_in: totalPrice,
        cost_in: totalPrice, // Use same amount for cost
        sku_in: `OTHER-${Date.now()}`,
        source_provider_in: 'other_entry',
        catalog_snapshot_in: {
          name: description.trim(),
          type: 'other_item'
        },
        pricing_snapshot_in: {
          total_price: totalPrice,
          amount: amount,
          price_per_item: totalPrice / amount,
          captured_at: new Date().toISOString()
        },
        processing_notes_in: `Other item entry: ${amount} ${description.trim()} at $${totalPrice.toFixed(2)} total ($${(totalPrice / amount).toFixed(2)} each)`
      };

      const response = await supabase.rpc('create_raw_intake_item', rpcParams);

      if (response.error) {
        console.error('Other item add error:', response.error);
        toast.error(`Failed to add other item: ${response.error.message}`);
      } else {
        toast.success(`Successfully added ${amount} ${description.trim()} to batch ($${totalPrice.toFixed(2)} total)`);
        
        // Dispatch browser event for real-time updates
        const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
        window.dispatchEvent(new CustomEvent('intake:item-added', { 
          detail: { ...responseData, lot_number: responseData?.lot_number }
        }));

        if (onBatchAdd) {
          onBatchAdd(responseData);
        }

        // Reset form
        setDescription('');
        setAmount(1);
        setTotalPrice(0);
      }
    } catch (error: any) {
      console.error('Other item add error:', error);
      toast.error(`Failed to add other item: ${error.message}`);
    } finally {
      setAddingOther(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Other Items Entry
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Add items that don't fit into graded cards, raw cards, or bulk categories
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description */}
        <div>
          <Label htmlFor="otherDescription">Description</Label>
          <Textarea
            id="otherDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter a description of the item(s)"
            className="w-full"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Amount */}
          <div>
            <Label htmlFor="otherAmount">Amount</Label>
            <Input
              id="otherAmount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 1)}
              placeholder="Enter amount"
            />
          </div>

          {/* Total Price */}
          <div>
            <Label htmlFor="otherTotalPrice">Total Price ($)</Label>
            <Input
              id="otherTotalPrice"
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
          onClick={handleAddOtherToBatch}
          disabled={addingOther || !description.trim() || !selectedStore || !selectedLocation || amount <= 0 || totalPrice <= 0 || accessCheckLoading}
          className="w-full"
        >
          {addingOther || accessCheckLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {accessCheckLoading ? 'Checking Access...' : 'Adding to Batch...'}
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Add to Batch
            </>
          )}
        </Button>

        <div className="text-xs text-muted-foreground">
          💡 Other items are added to batch and inventory but will not sync to Shopify or print barcode labels
        </div>
      </CardContent>
    </Card>
  );
}