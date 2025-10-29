import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIntakeValidation } from '@/hooks/useIntakeValidation';
import { useLogger } from '@/hooks/useLogger';
import { SubCategoryCombobox } from '@/components/ui/sub-category-combobox';
import { detectMainCategory } from '@/utils/categoryMapping';
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";

interface OtherItemsEntryProps {
  onBatchAdd?: (item: any) => void;
}

export function OtherItemsEntry({ onBatchAdd }: OtherItemsEntryProps) {
  const { validateAccess, assignedStore, selectedLocation } = useIntakeValidation();
  const logger = useLogger('OtherItemsEntry');
  const { mutateAsync: addItem, isPending: isAdding } = useAddIntakeItem();
  
  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(1);
  const [totalPrice, setTotalPrice] = useState(0);
  const [addingOther, setAddingOther] = useState(false);
  const [mainCategory, setMainCategory] = useState('tcg');
  const [subCategory, setSubCategory] = useState('');

  // Auto-detect main category when description changes
  React.useEffect(() => {
    if (description) {
      const detected = detectMainCategory(description);
      setMainCategory(detected);
    }
  }, [description]);

  // Add other item to batch
  const handleAddOtherToBatch = async () => {
    // Validate access first
    try {
      await validateAccess('add other item');
    } catch (error) {
      return;
    }

    logger.logInfo('Adding other item', { description, amount, totalPrice, mainCategory, subCategory });

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

    setAddingOther(true);

    try {
      const result = await addItem({
        store_key_in: assignedStore!.trim(),
        shopify_location_gid_in: selectedLocation!.trim(),
        quantity_in: amount,
        brand_title_in: 'Other Items',
        subject_in: description.trim(),
        category_in: subCategory || 'Other Items',
        variant_in: 'Other',
        card_number_in: '',
        grade_in: '',
        price_in: totalPrice,
        cost_in: totalPrice,
        sku_in: `OTHER-${Date.now()}`,
        source_provider_in: 'other_entry',
        main_category_in: mainCategory,
        sub_category_in: subCategory,
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
      });

      if (onBatchAdd) {
        onBatchAdd(result);
      }

      // Reset form
      setDescription('');
      setAmount(1);
      setTotalPrice(0);
      setSubCategory('');
    } catch (error: any) {
      logger.logError('Other item add error', error instanceof Error ? error : new Error(String(error)), { description, amount, totalPrice });
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
        <div>
          <Label htmlFor="mainCategory">Main Category</Label>
          <Select value={mainCategory} onValueChange={setMainCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tcg">🎴 TCG</SelectItem>
              <SelectItem value="sports">⚾ Sports</SelectItem>
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
          disabled={addingOther || !description.trim() || !assignedStore || !selectedLocation || amount <= 0 || totalPrice <= 0 || !subCategory}
          className="w-full"
        >
          {addingOther ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding to Batch...
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