import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { validateCompleteStoreContext } from "@/utils/storeValidation";
import { generateTCGSKU } from "@/lib/sku";
import { useRawIntakeSettings } from "@/hooks/useRawIntakeSettings";
import { rawCardSchema } from "@/lib/validation/intake-schemas";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { detectMainCategory } from "@/utils/categoryMapping";

interface RawCardIntakeProps {
  onBatchAdd?: (item: any) => void;
}

export const RawCardIntake = ({ onBatchAdd }: RawCardIntakeProps) => {
  const { assignedStore, selectedLocation } = useStore();
  const { settings } = useRawIntakeSettings();
  const [brand, setBrand] = useState("");
  const [subject, setSubject] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mainCategory, setMainCategory] = useState("tcg");
  const [subCategory, setSubCategory] = useState("");

  // Auto-detect main category when brand changes
  React.useEffect(() => {
    if (brand) {
      const detected = detectMainCategory(brand);
      setMainCategory(detected);
    }
  }, [brand]);

  const handleSubmit = async () => {
    // StoreContext is now stable - use directly
    if (!assignedStore || !selectedLocation) {
      console.error('[RawCardIntake] Cannot add item - store context missing');
      toast({
        title: "Store/Location Required",
        description: "Store location not set. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Validate input data before proceeding
      const validationResult = rawCardSchema.safeParse({
        brand,
        subject,
        cardNumber,
        condition,
        price,
        notes,
      });

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast({
          title: "Validation Error",
          description: firstError.message,
          variant: "destructive",
        });
        return;
      }

      validateCompleteStoreContext({ assignedStore, selectedLocation }, 'add raw card');
      
      setIsLoading(true);

      // Generate SKU using TCGPlayer logic (will fall back to appropriate format for manual entry)
      const generatedSku = generateTCGSKU(
        null, // No TCGPlayer ID for manual entry
        settings.defaultGame,
        null, // No variant ID
        `${brand}-${subject}-${cardNumber || 'unknown'}`.replace(/\s+/g, '-').toLowerCase()
      );

      const { data, error } = await supabase.rpc("create_raw_intake_item", {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: 1,
        brand_title_in: brand,
        subject_in: subject,
        category_in: subCategory || "Trading Cards",
        variant_in: "Raw",
        card_number_in: cardNumber,
        grade_in: condition,
        price_in: parseFloat(price) || 0,
        sku_in: generatedSku,
        processing_notes_in: notes,
        main_category_in: mainCategory,
        sub_category_in: subCategory,
        catalog_snapshot_in: {
          type: "raw_card",
          brand: brand,
          subject: subject,
          card_number: cardNumber,
          condition: condition
        }
      } as any);

      if (error) throw error;

      toast({
        title: "Card Added",
        description: `${brand} ${subject} added to batch`,
        variant: "default",
      });

      // Reset form
      setBrand("");
      setSubject("");
      setCardNumber("");
      setCondition("");
      setPrice("");
      setNotes("");

      // Trigger refresh
      onBatchAdd?.(Array.isArray(data) ? data[0] : data);
      
      // Dispatch events for CurrentBatchPanel
      const item = Array.isArray(data) ? data[0] : data;
      window.dispatchEvent(new CustomEvent('intake:item-added', { 
        detail: { 
          item: item,
          store: assignedStore,
          location: selectedLocation
        }
      }));
      
      window.dispatchEvent(new CustomEvent('batchItemAdded', { 
        detail: { 
          itemId: item.id,
          lot: item.lot_number,
          store: assignedStore,
          location: selectedLocation
        }
      }));

    } catch (error) {
      console.error("Error adding raw card:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add raw card",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raw Card Intake</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        <div>
          <Label htmlFor="mainCategory">Main Category <span className="text-destructive">*</span></Label>
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
          <Label htmlFor="subCategory">Sub-Category <span className="text-destructive">*</span></Label>
          <SubCategoryCombobox
            mainCategory={mainCategory}
            value={subCategory}
            onChange={setSubCategory}
          />
        </div>

        <div>
          <Label htmlFor="brand">Brand/Set</Label>
          <Input
            id="brand"
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g., Pokemon Base Set"
          />
        </div>

        <div>
          <Label htmlFor="subject">Card Name</Label>
          <Input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Charizard"
          />
        </div>

        <div>
          <Label htmlFor="cardNumber">Card Number (Optional)</Label>
          <Input
            id="cardNumber"
            type="text"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="e.g., 4/102"
          />
        </div>

        <div>
          <Label htmlFor="condition">Condition</Label>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger>
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Near Mint">Near Mint</SelectItem>
              <SelectItem value="Lightly Played">Lightly Played</SelectItem>
              <SelectItem value="Moderately Played">Moderately Played</SelectItem>
              <SelectItem value="Heavily Played">Heavily Played</SelectItem>
              <SelectItem value="Damaged">Damaged</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="price">Price ($)</Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes..."
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isLoading || !mainCategory || !subCategory || !brand || !subject || !condition || !price}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding to Batch...
            </>
          ) : (
            "Add to Batch"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};