import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIntakeValidation } from "@/hooks/useIntakeValidation";
import { generateTCGSKU } from "@/lib/sku";
import { manualRawCardSchema } from "@/lib/validation/intake-schemas";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { detectMainCategory } from "@/utils/categoryMapping";
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";

interface ManualRawCardEntryProps {
  onBatchAdd?: (item: any) => void;
}

const CONDITION_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "Near Mint", label: "Near Mint (NM)" },
  { value: "Lightly Played", label: "Lightly Played (LP)" },
  { value: "Moderately Played", label: "Moderately Played (MP)" },
  { value: "Heavily Played", label: "Heavily Played (HP)" },
  { value: "Damaged", label: "Damaged" },
];

export const ManualRawCardEntry: React.FC<ManualRawCardEntryProps> = ({ onBatchAdd }) => {
  const { assignedStore, selectedLocation, validateAccess } = useIntakeValidation();
  const { mutate: addItem, isPending } = useAddIntakeItem();
  
  const [formData, setFormData] = useState({
    mainCategory: "tcg",
    subCategory: "",
    brand: "",
    subject: "",
    cardNumber: "",
    year: "",
    condition: "",
    price: "",
    cost: "",
    quantity: 1,
    vendor: "",
    notes: "",
  });
  
  const [costPercentage, setCostPercentage] = useState(70);
  const [vendors, setVendors] = useState<string[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Load vendors when store/location changes
  useEffect(() => {
    const loadVendors = async () => {
      if (!assignedStore || !selectedLocation) return;
      
      setLoadingVendors(true);
      try {
        const { data, error } = await supabase
          .from('shopify_location_vendors')
          .select('vendor_name')
          .eq('store_key', assignedStore)
          .eq('location_gid', selectedLocation)
          .order('vendor_name');

        if (error) throw error;
        
        const vendorList = data?.map(v => v.vendor_name) || [];
        setVendors(vendorList);
        
        // Set default vendor if available
        const defaultVendor = data?.find(v => (v as any).is_default)?.vendor_name;
        if (defaultVendor && !formData.vendor) {
          setFormData(prev => ({ ...prev, vendor: defaultVendor }));
        }
      } catch (error: any) {
        console.error('Failed to load vendors:', error);
      } finally {
        setLoadingVendors(false);
      }
    };

    loadVendors();
  }, [assignedStore, selectedLocation]);

  // Auto-detect main category from brand
  useEffect(() => {
    if (formData.brand.trim()) {
      const detected = detectMainCategory(formData.brand);
      if (detected !== formData.mainCategory) {
        setFormData(prev => ({ 
          ...prev, 
          mainCategory: detected,
          subCategory: "" // Reset sub-category when main category changes
        }));
      }
    }
  }, [formData.brand]);

  // Auto-calculate cost from price and percentage
  useEffect(() => {
    if (formData.price) {
      const priceNum = parseFloat(formData.price);
      if (!isNaN(priceNum)) {
        const calculatedCost = (priceNum * costPercentage / 100).toFixed(2);
        setFormData(prev => ({ ...prev, cost: calculatedCost }));
      }
    }
  }, [formData.price, costPercentage]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    try {
      await validateAccess();
      
      // Validate form data
      const validation = manualRawCardSchema.safeParse(formData);
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast.error(firstError.message);
        return;
      }
      
      // Generate SKU
      const generatedSku = generateTCGSKU(
        null,
        'pokemon',
        null,
        `${formData.brand}-${formData.subject}-${formData.cardNumber || 'unknown'}`.replace(/\s+/g, '-').toLowerCase()
      );

      const itemPayload: any = {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        brand_title_in: formData.brand || null,
        subject_in: formData.subject || null,
        category_in: formData.subCategory || null,
        variant_in: formData.condition || "Raw",
        card_number_in: formData.cardNumber || null,
        year_in: formData.year || null,
        price_in: parseFloat(formData.price),
        cost_in: formData.cost ? parseFloat(formData.cost) : null,
        sku_in: generatedSku,
        processing_notes_in: formData.notes || null,
        main_category_in: formData.mainCategory,
        sub_category_in: formData.subCategory,
        catalog_snapshot_in: {
          type: "manual_raw_card",
          brand: formData.brand,
          subject: formData.subject,
          card_number: formData.cardNumber,
          condition: formData.condition,
          year: formData.year,
          notes: formData.notes,
          entry_method: "manual"
        }
      };

      addItem(itemPayload, {
        onSuccess: async (data) => {
          // Update vendor if selected
          if (formData.vendor) {
            await supabase
              .from('intake_items')
              .update({ vendor: formData.vendor })
              .eq('id', data.id);
          }
          
          // Reset form but keep vendor selection
          const vendorToKeep = formData.vendor;
          setFormData({
            mainCategory: "tcg",
            subCategory: "",
            brand: "",
            subject: "",
            cardNumber: "",
            year: "",
            condition: "",
            price: "",
            cost: "",
            quantity: 1,
            vendor: vendorToKeep,
            notes: "",
          });
          
          if (onBatchAdd) {
            onBatchAdd(data);
          }
        }
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to add item');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="mainCategory">Main Category *</Label>
            <Select value={formData.mainCategory} onValueChange={(value) => handleInputChange('mainCategory', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tcg">🃏 TCG (Trading Card Games)</SelectItem>
                <SelectItem value="sports">⚾ Sports Cards</SelectItem>
                <SelectItem value="comics">📚 Comics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="subCategory">Sub-Category *</Label>
            <SubCategoryCombobox
              mainCategory={formData.mainCategory}
              value={formData.subCategory}
              onChange={(value) => handleInputChange('subCategory', value)}
            />
          </div>

          <div>
            <Label htmlFor="brand">Brand/Set</Label>
            <Input
              id="brand"
              value={formData.brand}
              onChange={(e) => handleInputChange('brand', e.target.value)}
              placeholder="e.g., Pokemon Base Set, Upper Deck"
            />
          </div>

          <div>
            <Label htmlFor="subject">Card Name</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              placeholder="e.g., Charizard, Pikachu"
            />
          </div>

          <div>
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input
              id="cardNumber"
              value={formData.cardNumber}
              onChange={(e) => handleInputChange('cardNumber', e.target.value)}
              placeholder="e.g., 4/102"
            />
          </div>

          <div>
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              value={formData.year}
              onChange={(e) => handleInputChange('year', e.target.value)}
              placeholder="e.g., 1999, 2024"
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="condition">Condition</Label>
            <Select value={formData.condition} onValueChange={(value) => handleInputChange('condition', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="price">Price *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => handleInputChange('price', e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="costPercentage">Cost % of Price</Label>
            <Input
              id="costPercentage"
              type="number"
              value={costPercentage}
              onChange={(e) => setCostPercentage(parseInt(e.target.value) || 70)}
              placeholder="70"
            />
          </div>

          <div>
            <Label htmlFor="cost">Cost</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => handleInputChange('cost', e.target.value)}
              placeholder="Auto-calculated"
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              value={formData.quantity}
              onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 1)}
              min={1}
            />
          </div>

          <div>
            <Label htmlFor="vendor">Vendor</Label>
            <Select 
              value={formData.vendor} 
              onValueChange={(value) => handleInputChange('vendor', value)}
              disabled={loadingVendors}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingVendors ? "Loading..." : "Select vendor"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No vendor</SelectItem>
                {vendors.map(vendor => (
                  <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Full Width */}
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleInputChange('notes', e.target.value)}
          placeholder="Any additional notes or observations..."
          rows={3}
        />
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={isPending}
        className="w-full"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Add to Batch
      </Button>
    </div>
  );
};
